'use server';

import { createHash } from 'node:crypto';
import { revalidatePath, updateTag } from 'next/cache';
import { eventCacheTag } from '@/lib/cache-tags';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import type Stripe from 'stripe';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError, UnauthorizedError } from '@pickupvb/domain';
import { handlers, analytics } from '@/lib/handlers';
import { field, fieldOrNull } from '@/lib/form-data';
import { hasProBenefits } from '@/lib/admin';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { requireSession } from '@/lib/server-auth';
import { buildOrigin } from '@/lib/server-redirects';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { SPONSOR_SLOT_UNLOCK_CENTS } from '@/lib/pro';

type SponsorDraft = {
  name: string;
  blurb: string | null;
  linkUrl: string | null;
  logoUrl: string | null;
  discountCode: string | null;
};

function flashTo(eventId: string, code: string, msg?: string): never {
  const params = new URLSearchParams({ sponsor: code });
  if (msg) params.set('sponsor_msg', msg);
  redirect(`/events/${eventId}/edit?${params.toString()}`);
}

function parseDraft(formData: FormData): SponsorDraft {
  const name = field(formData, 'name');
  const blurb = fieldOrNull(formData, 'blurb', 140);
  const discountCode = fieldOrNull(formData, 'discount_code', 32);
  const linkUrl = normalizeHttpsUrlOrNull(fieldOrNull(formData, 'link_url', 300));
  const logoUrl = normalizeHttpsUrlOrNull(fieldOrNull(formData, 'logo_url', 300));

  if (!name) throw new Error('Sponsor name is required.');
  if (fieldOrNull(formData, 'link_url', 300) && !linkUrl) {
    throw new Error('Sponsor link must start with https://');
  }
  if (fieldOrNull(formData, 'logo_url', 300) && !logoUrl) {
    throw new Error('Logo URL must start with https://');
  }

  return { name, blurb, linkUrl, logoUrl, discountCode };
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
    throw new UnauthorizedError('Only event managers can update sponsors.');
  }
}

/**
 * Has this event's à-la-carte sponsor unlock been paid? Reads the entitlement
 * row on the admin client — `event_sponsor_access` has no client RLS policies
 * (webhook-written, AGENTS pitfall #8). Decoupled from the sponsor content so a
 * removed sponsor keeps its paid unlock (monetization audit SP-1). Mirrors
 * `badgeSlotPaid` in badge-actions.ts.
 */
async function sponsorSlotPaid(eventId: string): Promise<boolean> {
  const { data } = await getAdminSupabase()
    .from('event_sponsor_access')
    .select('paid_at')
    .eq('event_id', eventId)
    .maybeSingle();
  return (data as { paid_at: string | null } | null)?.paid_at != null;
}

async function loadEventHostId(eventId: string): Promise<string | null> {
  const sb = await getServerSupabase();
  const { data } = await sb.from('events').select('host_id').eq('id', eventId).maybeSingle();
  return (data as { host_id: string } | null)?.host_id ?? null;
}

export async function upsertSponsorFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);

  try {
    await assertCanManage(eventId, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) flashTo(eventId, 'notfound');
    if (err instanceof UnauthorizedError) flashTo(eventId, 'unauthorized');
    flashTo(eventId, 'unauthorized');
  }

  let draft: SponsorDraft;
  try {
    draft = parseDraft(formData);
  } catch (err) {
    flashTo(eventId, 'invalid', err instanceof Error ? err.message : 'Invalid sponsor details.');
  }

  const [pro, paid] = await Promise.all([hasProBenefits(user.id), sponsorSlotPaid(eventId)]);
  if (!pro && !paid) flashTo(eventId, 'pro');

  const sb = await getServerSupabase();
  const { error } = await sb.from('event_sponsors').upsert(
    {
      event_id: eventId,
      name: draft.name,
      blurb: draft.blurb,
      link_url: draft.linkUrl,
      logo_url: draft.logoUrl,
      discount_code: draft.discountCode,
    },
    { onConflict: 'event_id' },
  );

  if (error) flashTo(eventId, 'error', error.message);

  revalidatePath(returnPath);
  updateTag(eventCacheTag(eventId));
  flashTo(eventId, 'saved');
}

/**
 * Free-tier a-la-carte sponsor unlock: charge a one-time fee, then let the
 * Stripe webhook materialize/update the sponsor row.
 */
export async function startSponsorSlotCheckoutFromForm(
  eventId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const { user } = await requireSession(`/events/${eventId}/edit`);

  try {
    await assertCanManage(eventId, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) flashTo(eventId, 'notfound');
    if (err instanceof UnauthorizedError) flashTo(eventId, 'unauthorized');
    flashTo(eventId, 'unauthorized');
  }

  const [pro, paid] = await Promise.all([hasProBenefits(user.id), sponsorSlotPaid(eventId)]);
  // Entitled users should use the direct save path — no one-off checkout.
  if (pro || paid) {
    await upsertSponsorFromForm(eventId, returnPath, formData);
  }

  if (!isStripeConfigured()) {
    flashTo(eventId, 'error', 'Payments are not configured.');
  }

  let draft: SponsorDraft;
  try {
    draft = parseDraft(formData);
  } catch (err) {
    flashTo(eventId, 'invalid', err instanceof Error ? err.message : 'Invalid sponsor details.');
  }

  const origin = await buildOrigin();
  const hostId = await loadEventHostId(eventId);

  // Idempotency key folds the draft in: a re-submit of the SAME sponsor details
  // (e.g. the SDK's own network retry) maps to one Checkout Session, but editing
  // any field produces a new key — Stripe would otherwise reject a reused key
  // with a changed body. (TPI-5 parity for the slot flows.)
  const draftHash = createHash('sha256').update(JSON.stringify(draft)).digest('hex').slice(0, 16);

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
              unit_amount: SPONSOR_SLOT_UNLOCK_CENTS,
              product_data: {
                name: 'Event sponsor slot unlock',
                description: 'One-time unlock for this event',
              },
            },
          },
        ],
        metadata: {
          kind: 'sponsor_slot',
          event_id: eventId,
          user_id: user.id,
          ...(hostId ? { host_id: hostId } : {}),
          sponsor_name: draft.name,
          sponsor_blurb: draft.blurb ?? '',
          sponsor_link_url: draft.linkUrl ?? '',
          sponsor_logo_url: draft.logoUrl ?? '',
          sponsor_discount_code: draft.discountCode ?? '',
        },
        success_url: `${origin}/events/${eventId}/edit?sponsor=checkout_success`,
        cancel_url: `${origin}/events/${eventId}/edit?sponsor=checkout_cancel`,
      },
      { idempotencyKey: `sponsor:${eventId}:${user.id}:${draftHash}` },
    );
  } catch (err) {
    flashTo(
      eventId,
      'error',
      err instanceof Error ? err.message : 'Could not start sponsor checkout.',
    );
  }

  if (!session.url) flashTo(eventId, 'error', 'Stripe did not return a checkout URL.');

  analytics.capture(
    {
      name: 'checkout_started',
      props: {
        eventId,
        hostId: hostId ?? user.id,
        amountCents: SPONSOR_SLOT_UNLOCK_CENTS,
        kind: 'sponsor_slot',
      },
    },
    user.id,
  );

  redirect(session.url as Route);
}

export async function removeSponsor(eventId: string, returnPath: string): Promise<never> {
  const { user } = await requireSession(`/events/${eventId}/edit`);

  try {
    await assertCanManage(eventId, user.id);
  } catch (err) {
    if (err instanceof NotFoundError) flashTo(eventId, 'notfound');
    if (err instanceof UnauthorizedError) flashTo(eventId, 'unauthorized');
    flashTo(eventId, 'unauthorized');
  }

  // Removal is NOT entitlement-gated (monetization audit SP-2): a host must be
  // able to delete their own sponsor regardless of current Pro / à-la-carte
  // status (e.g. after a Pro lapse). `assertCanManage` above is the only gate.
  // Only the content row is deleted — the `event_sponsor_access` entitlement
  // survives, so re-adding a sponsor later is free (SP-1).
  const sb = await getServerSupabase();
  const { error } = await sb.from('event_sponsors').delete().eq('event_id', eventId);
  if (error) flashTo(eventId, 'error', error.message);

  revalidatePath(returnPath);
  updateTag(eventCacheTag(eventId));
  flashTo(eventId, 'removed');
}
