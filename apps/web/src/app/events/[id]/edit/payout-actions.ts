'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { bool } from '@/lib/form-data';
import { isPricingLocked } from '@/lib/pricing-lock';
import { isClubGroup } from '@/lib/club';
import { getGroupStripeAccount } from '@/lib/group-stripe-account';
import { eventCacheTag } from '@/lib/cache-tags';

/**
 * Opt an event's payouts to its host group's Club account, or back to the host
 * (ADR 0038). Money-safety gates: (1) the caller must manage the event; (2) the
 * event must be group-hosted and that group must be an active Club with a
 * charges-enabled Connect account; (3) routing can only change while the price
 * is unlocked (no paid registration yet) — once a ticket sells the destination
 * is frozen, exactly like host_id. `payout_group_id` is otherwise always either
 * the host_group_id or null.
 */
function flash(eventId: string, code: string, msg?: string): never {
  const params = new URLSearchParams({ payout: code });
  if (msg) params.set('payout_msg', msg);
  redirect(`/events/${eventId}/edit?${params.toString()}` as Route);
}

export async function setEventPayoutGroup(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(`/events/${eventId}/edit`);

  try {
    const detail = await handlers.getEventDetail.execute(new GetEventDetailQuery(eventId, user.id));
    if (!detail.canManage) flash(eventId, 'unauthorized');
  } catch (err) {
    if (err instanceof NotFoundError) flash(eventId, 'notfound');
    flash(eventId, 'unauthorized');
  }

  // Frozen once money has flowed (same lock that freezes the price).
  if (await isPricingLocked(eventId)) {
    flash(eventId, 'locked', 'Payout routing is locked once a registration is paid.');
  }

  const sb = await getServerSupabase();
  const { data } = await sb.from('events').select('host_group_id').eq('id', eventId).maybeSingle();
  const hostGroupId = (data as { host_group_id: string | null } | null)?.host_group_id ?? null;

  const route = bool(formData, 'route');

  if (!route) {
    const { error } = await sb.from('events').update({ payout_group_id: null }).eq('id', eventId);
    if (error) flash(eventId, 'error', error.message);
    revalidatePath(returnPath);
    revalidatePath(`/events/${eventId}/edit`);
    updateTag(eventCacheTag(eventId));
    flash(eventId, 'saved');
  }

  // Routing ON — verify the group is a Club with a ready payout account.
  if (!hostGroupId) flash(eventId, 'no_group');
  const [club, groupAcct] = await Promise.all([
    isClubGroup(hostGroupId),
    getGroupStripeAccount(hostGroupId),
  ]);
  if (!club) flash(eventId, 'needs_club');
  if (!groupAcct) flash(eventId, 'group_not_ready');

  const { error } = await sb
    .from('events')
    .update({ payout_group_id: hostGroupId })
    .eq('id', eventId);
  if (error) flash(eventId, 'error', error.message);
  revalidatePath(returnPath);
  revalidatePath(`/events/${eventId}/edit`);
  updateTag(eventCacheTag(eventId));
  flash(eventId, 'saved');
}
