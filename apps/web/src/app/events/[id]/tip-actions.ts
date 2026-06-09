'use server';

import { redirect } from 'next/navigation';
import type Stripe from 'stripe';
import type { Route } from 'next';
import { isStripeConfigured } from '@/lib/stripe';
import { tipPlatformFeeCents } from '@/lib/event-pricing';
import { getServerSupabase } from '@/lib/supabase';
import { getEventPayoutAccount } from '@/lib/event-payout';
import { buildOrigin, redirectEventNotice } from '@/lib/server-redirects';
import { createDestinationCheckoutSession } from '@/lib/checkout-session';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { field } from '@/lib/form-data';
import { log } from '@/lib/log';
import { analytics } from '@/lib/handlers';
import { MIN_TIP_CENTS, MAX_TIP_CENTS } from './tip-constants';

function backWithError(eventId: string, code: string, msg?: string): never {
  redirectEventNotice(eventId, 'tip', code, msg);
}

function parseAmountCents(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  if (cents < MIN_TIP_CENTS || cents > MAX_TIP_CENTS) return null;
  return cents;
}

type EventLite = {
  id: string;
  host_id: string;
  title: string;
};

async function loadEvent(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  eventId: string,
): Promise<EventLite | null> {
  const { data } = await supabase
    .from('events')
    .select('id, host_id, title')
    .eq('id', eventId)
    .maybeSingle();
  return (data as EventLite | null) ?? null;
}

/**
 * Send a tip to the event host. Works for any event (free or paid). Tipping
 * is opt-in by the user and never required.
 *
 * Authenticated (incl. anon-auth) users only — the calling form mints an
 * anonymous Supabase session first via the guest flow if needed.
 */
export async function startTipCheckout(eventId: string, formData: FormData): Promise<void> {
  if (!isStripeConfigured()) backWithError(eventId, 'error', 'Payments are not configured.');

  const amountCents = parseAmountCents(field(formData, 'amount'));
  if (amountCents === null) {
    backWithError(
      eventId,
      'error',
      `Tip must be between $${MIN_TIP_CENTS / 100} and $${MAX_TIP_CENTS / 100}.`,
    );
  }
  const message = field(formData, 'message').slice(0, 280) || null;

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) backWithError(eventId, 'signin');

  const event = await loadEvent(supabase, eventId);
  if (!event) backWithError(eventId, 'error', 'Event not found.');
  if (event.host_id === user.id) backWithError(eventId, 'error', "You can't tip your own event.");

  const hostAccountId = await getEventPayoutAccount(eventId, event.host_id);
  if (!hostAccountId) backWithError(eventId, 'error', 'Host has not finished payment setup.');

  // Look up tipper display name for the public list.
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  const displayName = (profile as { display_name: string | null } | null)?.display_name ?? null;

  // PickupVB takes no platform fee on tips (ADR 0014 tip-fee amendment) — the
  // host receives 100% of the tip, less only Stripe's processing fee. Stored as
  // 0 on the tip row and omitted from the destination charge's application fee.
  const platformCut = tipPlatformFeeCents(amountCents!);

  // Insert pending tip row up front so the webhook can match by session id.
  // RLS: event_tips_insert_own gates this on auth.uid() = tipper_user_id
  // and status = 'pending'. The webhook handler (admin client) is what
  // flips status to 'paid' later.
  const { data: inserted, error: insertErr } = await supabase
    .from('event_tips')
    .insert({
      event_id: eventId,
      host_id: event.host_id,
      tipper_user_id: user.id,
      tipper_display_name: displayName,
      amount_cents: amountCents,
      platform_fee_cents: platformCut,
      message,
      status: 'pending',
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    await log.error('[tip] insert pending failed', insertErr, { eventId });
    backWithError(eventId, 'error', insertErr?.message ?? 'Could not start tip.');
  }
  const tipId = (inserted as { id: string }).id;

  const origin = await buildOrigin();

  let session: Stripe.Checkout.Session;
  try {
    session = await createDestinationCheckoutSession({
      destinationAccountId: hostAccountId!,
      applicationFeeAmount: platformCut,
      customerEmail: user.email ?? null,
      lineItems: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents!,
            product_data: {
              name: `Tip — ${event.title}`,
              ...(message ? { description: message } : {}),
            },
          },
        },
      ],
      successUrl: `${origin}/events/${eventId}?tip=thanks`,
      cancelUrl: `${origin}/events/${eventId}?tip=cancel`,
      metadata: {
        kind: 'tip',
        event_id: eventId,
        host_id: event.host_id,
        user_id: user.id,
        tip_id: tipId,
      },
      // One pending tip row → at most one Checkout Session (TPI-5).
      idempotencyKey: `tip:${tipId}`,
    });
  } catch (err) {
    // Roll back the pending row.
    await supabase.from('event_tips').delete().eq('id', tipId);
    await log.error('[tip] session create failed', err, { eventId });
    const m = err instanceof Error ? err.message : 'Could not start tip checkout.';
    backWithError(eventId, 'error', m);
  }

  await supabase.from('event_tips').update({ stripe_session_id: session.id }).eq('id', tipId);

  if (!session.url) backWithError(eventId, 'error', 'Stripe did not return a URL.');
  // No `revalidatePath` here: payment hasn't completed yet. The Stripe
  // `checkout.session.completed` webhook handles revalidation once the
  // tip is recorded.
  analytics.capture(
    {
      name: 'checkout_started',
      props: {
        eventId,
        hostId: event.host_id,
        amountCents: amountCents!,
        kind: 'tip',
      },
    },
    user.id,
  );
  redirect(session.url as Route);
}

/**
 * Guest variant — mints an anonymous Supabase session first (same pattern
 * as guest ticket purchase), then delegates to startTipCheckout.
 */
export async function startGuestTipCheckout(eventId: string, formData: FormData): Promise<void> {
  const displayName = field(formData, 'display_name');
  const turnstileToken = field(formData, 'cf-turnstile-response');

  if (displayName.length < 1 || displayName.length > 80) {
    backWithError(eventId, 'error', 'Name is required (1–80 characters).');
  }
  const turnstile = await verifyTurnstileToken(turnstileToken || null);
  if (!turnstile.ok) backWithError(eventId, 'error', turnstile.error ?? 'Verification failed.');

  const supabase = await getServerSupabase();
  const {
    data: { user: existing },
  } = await supabase.auth.getUser();

  if (!existing) {
    const { data, error } = await supabase.auth.signInAnonymously({
      options: { data: { display_name: displayName } },
    });
    if (error || !data.user) {
      backWithError(eventId, 'error', error?.message ?? 'Could not start a guest session.');
    }
  }

  // Persist chosen name onto profile so it shows on the public tip list.
  const userId = existing?.id ?? (await supabase.auth.getUser()).data.user?.id;
  if (userId) {
    await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId);
  }

  await startTipCheckout(eventId, formData);
}
