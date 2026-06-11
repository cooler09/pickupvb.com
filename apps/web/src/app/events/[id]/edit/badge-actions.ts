'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import type Stripe from 'stripe';
import { GetEventDetailQuery } from '@pickupvb/application';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  assertCleanName,
  maskPublicText,
} from '@pickupvb/domain';
import { handlers, analytics } from '@/lib/handlers';
import { field, fieldOrNull } from '@/lib/form-data';
import { hasProBenefits } from '@/lib/admin';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { requireSession } from '@/lib/server-auth';
import { buildOrigin } from '@/lib/server-redirects';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { eventCacheTag } from '@/lib/cache-tags';
import { BADGE_SLOT_UNLOCK_CENTS } from '@/lib/pro';

/** Has this event's à-la-carte badge unlock been paid? Reads the access row on
 * the admin client (the table has no client RLS policies — webhook-written).
 * Internal (not exported): a `'use server'` module exposes every export as a
 * callable action, and this is just a gate helper. */
async function badgeSlotPaid(eventId: string): Promise<boolean> {
  const { data } = await getAdminSupabase()
    .from('event_badge_access')
    .select('paid_at')
    .eq('event_id', eventId)
    .maybeSingle();
  return (data as { paid_at: string | null } | null)?.paid_at != null;
}

async function loadEventHostId(eventId: string): Promise<string | null> {
  const sb = await getServerSupabase();
  const { data } = await sb.from('events').select('host_id').eq('id', eventId).maybeSingle();
  return (data as { host_id: string | null } | null)?.host_id ?? null;
}

/**
 * Host-authored event badges (gamification Phase 2). Authoring is a Pro
 * capability — same shape as the sponsor slot ([sponsor-actions.ts]): RLS
 * authorizes "can manage this event", the application layer authorizes "is
 * allowed to create a badge at all". Label is hard-blocked for profanity
 * (`assertCleanName`); description is mask-at-write (`maskPublicText`) — the
 * same UGC discipline as media/listing text (ADR 0030).
 */

function flashTo(eventId: string, code: string, msg?: string): never {
  const params = new URLSearchParams({ badge: code });
  if (msg) params.set('badge_msg', msg);
  redirect(`/events/${eventId}/edit?${params.toString()}`);
}

function normalizeHttpsUrlOrNull(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function assertCanManage(eventId: string, userId: string): Promise<void> {
  const detail = await handlers.getEventDetail.execute(new GetEventDetailQuery(eventId, userId));
  if (!detail.canManage) {
    throw new UnauthorizedError('Only event managers can manage badges.');
  }
}

export async function addEventBadgeFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);

  try {
    await assertCanManage(eventId, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) flashTo(eventId, 'notfound');
    flashTo(eventId, 'unauthorized');
  }

  const [pro, paid] = await Promise.all([hasProBenefits(user.id), badgeSlotPaid(eventId)]);
  if (!pro && !paid) flashTo(eventId, 'pro');

  const rawLabel = field(formData, 'label');
  if (!rawLabel) flashTo(eventId, 'invalid', 'A badge label is required.');

  let label: string;
  try {
    label = assertCleanName(rawLabel);
  } catch (err) {
    if (err instanceof ValidationError)
      flashTo(eventId, 'invalid', 'Please choose a cleaner label.');
    flashTo(eventId, 'invalid', 'Invalid badge label.');
  }

  const rawDescription = fieldOrNull(formData, 'description', 140);
  const description = rawDescription ? maskPublicText(rawDescription) : null;
  const iconUrl = normalizeHttpsUrlOrNull(fieldOrNull(formData, 'icon_url', 300));
  const grantRule = field(formData, 'grant_rule') === 'host_grant' ? 'host_grant' : 'on_attend';
  // The add form generates the id client-side so the uploaded icon path
  // ({user}/{event}/badges/{id}.{ext}) and the row id line up.
  const id = field(formData, 'id') || randomUUID();

  const sb = await getServerSupabase();
  const { error } = await sb.from('event_badges').insert({
    id,
    event_id: eventId,
    label,
    description,
    icon_url: iconUrl,
    grant_rule: grantRule,
  });
  if (error) flashTo(eventId, 'error', error.message);

  // BA-7: an on_attend badge added to an already-finished event must reach
  // attendees who won't revisit their profile (and may sit outside the reconcile
  // cron's 7-day window). Backfill it to the event's past attendees now —
  // idempotent and best-effort, so it never blocks the host's save.
  if (grantRule === 'on_attend') {
    await sb.rpc('grant_attended_badges_for_event', { p_event_id: eventId }).then(
      () => undefined,
      () => undefined,
    );
  }

  revalidatePath(returnPath);
  updateTag(eventCacheTag(eventId));
  flashTo(eventId, 'saved');
}

export async function removeEventBadge(
  eventId: string,
  badgeId: string,
  returnPath: string,
  _formData: FormData,
): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);

  try {
    await assertCanManage(eventId, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) flashTo(eventId, 'notfound');
    flashTo(eventId, 'unauthorized');
  }

  const sb = await getServerSupabase();
  const { error } = await sb
    .from('event_badges')
    .delete()
    .eq('id', badgeId)
    .eq('event_id', eventId);
  if (error) flashTo(eventId, 'error', error.message);

  revalidatePath(returnPath);
  updateTag(eventCacheTag(eventId));
  flashTo(eventId, 'removed');
}

/**
 * Free-tier à-la-carte unlock: charge a one-time fee, then let the Stripe
 * webhook (`badge_slot`) write the `event_badge_access` row that flips
 * `canUseBadges` on. Mirrors `startSponsorSlotCheckoutFromForm`. Entitled hosts
 * (Pro or already-paid) bounce straight back — they have nothing to buy.
 */
export async function startBadgeSlotCheckoutFromForm(
  eventId: string,
  returnPath: string,
  _formData: FormData,
): Promise<void> {
  const { user } = await requireSession(`/events/${eventId}/edit`);

  try {
    await assertCanManage(eventId, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) flashTo(eventId, 'notfound');
    flashTo(eventId, 'unauthorized');
  }

  const [pro, paid] = await Promise.all([hasProBenefits(user.id), badgeSlotPaid(eventId)]);
  if (pro || paid) {
    revalidatePath(returnPath);
    redirect(returnPath as Route);
  }

  if (!isStripeConfigured()) flashTo(eventId, 'error', 'Payments are not configured.');

  const origin = await buildOrigin();
  const hostId = await loadEventHostId(eventId);

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create(
      {
        mode: 'payment',
        ...(user.email ? { customer_email: user.email } : {}),
        allow_promotion_codes: true,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: BADGE_SLOT_UNLOCK_CENTS,
              product_data: {
                name: 'Collectible badges unlock',
                description: 'One-time unlock of collectible badges for this event',
              },
            },
          },
        ],
        metadata: {
          kind: 'badge_slot',
          event_id: eventId,
          user_id: user.id,
          ...(hostId ? { host_id: hostId } : {}),
        },
        success_url: `${origin}/events/${eventId}/edit?badge=checkout_success`,
        cancel_url: `${origin}/events/${eventId}/edit?badge=checkout_cancel`,
      },
      // The badge unlock has no per-attempt draft (it's a flat one-event unlock),
      // so a stable key dedupes the SDK's own network retries to one session.
      // (TPI-5 parity for the slot flows.)
      { idempotencyKey: `badge:${eventId}:${user.id}` },
    );
  } catch (err) {
    flashTo(eventId, 'error', err instanceof Error ? err.message : 'Could not start checkout.');
  }

  if (!session.url) flashTo(eventId, 'error', 'Stripe did not return a checkout URL.');

  analytics.capture(
    {
      name: 'checkout_started',
      props: {
        eventId,
        hostId: hostId ?? user.id,
        amountCents: BADGE_SLOT_UNLOCK_CENTS,
        kind: 'badge_slot',
      },
    },
    user.id,
  );

  redirect(session.url as Route);
}
