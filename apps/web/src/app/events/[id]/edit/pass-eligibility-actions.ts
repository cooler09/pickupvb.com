'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { requireRealUser } from '@/lib/server-auth';
import { hasProBenefits } from '@/lib/admin';
import { getServerSupabase } from '@/lib/supabase';
import { bool } from '@/lib/form-data';
import { eventCacheTag } from '@/lib/cache-tags';

/**
 * Toggle whether an open-play event accepts pass-credit redemption (ADR 0037).
 * Independent-save panel on the edit page. Gated to Pro hosts (only they sell
 * passes); RLS on `events` update also enforces event ownership. Open-play is
 * the v1 scope — the panel is only rendered for open-play, and a tampered call
 * on another type is harmless (the redeem RPC re-checks `type = 'open_play'`).
 */
export async function setEventAcceptsPasses(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireRealUser(`/events/${eventId}/edit`);
  if (!(await hasProBenefits(user.id))) {
    redirect(`/events/${eventId}/edit?pass=pro` as Route);
  }

  const accepts = bool(formData, 'accepts');
  const sb = await getServerSupabase();
  const { error } = await sb
    .from('events')
    .update({ accepts_pass_credits: accepts })
    .eq('id', eventId);
  if (error) {
    redirect(`/events/${eventId}/edit?pass=error&pass_msg=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(returnPath);
  revalidatePath(`/events/${eventId}/edit`);
  updateTag(eventCacheTag(eventId));
  redirect(`/events/${eventId}/edit?pass=eligibility_saved` as Route);
}
