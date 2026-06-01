'use server';

import { redirect } from 'next/navigation';
import type Stripe from 'stripe';
import type { Route } from 'next';
import { isStripeConfigured } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/supabase';
import {
  getEventPricing,
  attendeeChargeBreakdownAsync,
  platformFeeCentsFor,
} from '@/lib/event-pricing';
import { getHostStripeAccount } from '@/lib/host-stripe-account';
import { buildOrigin, redirectEventNotice } from '@/lib/server-redirects';
import { createDestinationCheckoutSession } from '@/lib/checkout-session';
import { field } from '@/lib/form-data';
import { log } from '@/lib/log';
import { consumeRateLimit, getClientIp, rateLimitKey } from '@/lib/rate-limit';
import { analytics } from '@/lib/handlers';

function backWithError(eventId: string, code: string, msg?: string): never {
  redirectEventNotice(eventId, 'rsvp', code, msg);
}

/**
 * Authenticated user is buying a ticket.
 *
 * Flow:
 * 1. Resolve viewer + pricing.
 * 2. Insert a `pending` event_attendees row (capacity trigger reserves the
 *    spot atomically — if the event is full this throws and we bail).
 * 3. Create a Stripe Checkout Session with metadata pointing at the row.
 * 4. Redirect to Stripe.
 *
 * The webhook (`checkout.session.completed`) flips the row to `paid`, or
 * deletes it on `checkout.session.expired` / payment_failed.
 */
export async function startTicketCheckout(eventId: string): Promise<void> {
  if (!isStripeConfigured()) backWithError(eventId, 'payments_off');

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) backWithError(eventId, 'signin');
  // Anonymous auth users CAN buy tickets; we just need them to have an
  // auth session. The guest form (→ startGuestTicketCheckout) mints one.

  const pricing = await getEventPricing(eventId);
  if (!pricing) backWithError(eventId, 'event_not_found');
  if (pricing.priceCents <= 0) {
    // Free event — caller should have used joinEvent. Just bounce them.
    backWithError(eventId, 'not_paid_event');
  }

  const hostAccountId = await getHostStripeAccount(pricing.hostId);
  if (!hostAccountId) {
    backWithError(eventId, 'host_not_ready');
  }

  const breakdown = await attendeeChargeBreakdownAsync(pricing);

  // Reserve the spot atomically. The capacity trigger raises if full.
  // 23505 (unique violation on PK) means the user already has a row;
  // could be from a previous checkout that didn't complete.
  //
  // RLS: event_participants_insert requires auth.uid() = user_id, so
  // this is self-service. Webhook handlers (admin client) flip the
  // payment row status to 'paid' later; the user can't self-promote
  // (event_participants_update_own_pending requires the payment row
  // to stay 'pending').
  //
  // Two-step write: insert the participant; on success upsert the
  // matching payment row. The bridge view's INSTEAD OF trigger used to
  // do this atomically; we own the cleanup window now.
  let participantId: string | null = null;
  const { data: insertedRow, error: insertErr } = await supabase
    .from('event_participants')
    .insert({
      division_id: pricing.divisionId,
      user_id: user.id,
      role: 'attendee',
    } as never)
    .select('id')
    .maybeSingle();
  if (insertedRow) participantId = (insertedRow as { id: string }).id;
  if (insertErr) {
    // Reuse the existing row if any (idempotent retry of a prior
    // checkout). For other errors, surface a friendly message.
    if (insertErr.code === '23505') {
      // Already have a row. If they're already 'paid' bounce them, else
      // fall through and create a new checkout for the existing pending row.
      const { data: existing } = await supabase
        .from('event_participants')
        .select('id, payment:event_participant_payments(payment_status)')
        .eq('role', 'attendee')
        .eq('division_id', pricing.divisionId)
        .eq('user_id', user.id)
        .maybeSingle();
      const exEmbed = existing as unknown as {
        id: string;
        payment: { payment_status: string } | null;
      } | null;
      const status = exEmbed?.payment?.payment_status ?? 'pending';
      if (status === 'paid') backWithError(eventId, 'already');
      participantId = exEmbed?.id ?? null;
      // status === 'pending' or 'none' — proceed to (re)create checkout.
    } else if (insertErr.message?.toLowerCase().includes('full')) {
      backWithError(eventId, 'full');
    } else {
      await log.error('[checkout] reserve attendee failed', insertErr, { eventId });
      backWithError(eventId, 'error', insertErr.message);
    }
  }

  // Make sure a pending payment row exists for this participant. Upsert
  // is idempotent across checkout retries.
  if (participantId) {
    const { error: payErr } = await supabase.from('event_participant_payments').upsert(
      {
        participant_id: participantId,
        payment_status: 'pending',
        amount_paid_cents: 0,
      } as never,
      { onConflict: 'participant_id' },
    );
    if (payErr) {
      // Roll back the participant so capacity reopens.
      await supabase.from('event_participants').delete().eq('id', participantId);
      await log.error('[checkout] payment row create failed', payErr, { eventId });
      backWithError(eventId, 'error', payErr.message);
    }
  }

  const origin = await buildOrigin();

  let session: Stripe.Checkout.Session;
  try {
    session = await createDestinationCheckoutSession({
      destinationAccountId: hostAccountId!,
      applicationFeeAmount: await platformFeeCentsFor(pricing.hostId, pricing.priceCents),
      customerEmail: user.email ?? null,
      lineItems: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: breakdown.ticketCents,
            product_data: { name: 'Event ticket' },
          },
        },
        ...(breakdown.platformFeeCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: 'usd' as const,
                  unit_amount: breakdown.platformFeeCents,
                  product_data: { name: 'Service fee' },
                },
              },
            ]
          : []),
        ...(breakdown.processingFeeCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: 'usd' as const,
                  unit_amount: breakdown.processingFeeCents,
                  product_data: { name: 'Processing fee' },
                },
              },
            ]
          : []),
      ],
      successUrl: `${origin}/events/${eventId}/checkout/success?session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/events/${eventId}/checkout/cancel?session={CHECKOUT_SESSION_ID}`,
      metadata: {
        event_id: eventId,
        user_id: user.id,
        kind: 'attendee',
      },
      // One pending participant row → at most one Checkout Session (TPI-5).
      ...(participantId ? { idempotencyKey: `ticket:${participantId}` } : {}),
    });
  } catch (err) {
    // Roll back the pending row so we don't leak capacity. Cascade deletes
    // the payment row.
    if (participantId) {
      await supabase.from('event_participants').delete().eq('id', participantId);
    }
    await log.error('[checkout] session create failed', err, { eventId });
    const m = err instanceof Error ? err.message : 'Could not start checkout.';
    backWithError(eventId, 'error', m);
  }

  // Stash the session id on the payment row so we can match the webhook later.
  await supabase
    .from('event_participant_payments')
    .update({ checkout_session_id: session.id } as never)
    .eq('participant_id', participantId!);

  if (!session.url) backWithError(eventId, 'error', 'Stripe did not return a URL.');
  // No `revalidatePath` here: payment hasn't completed yet. The Stripe
  // `checkout.session.completed` webhook revalidates once the attendee
  // is marked paid.
  analytics.capture(
    {
      name: 'checkout_started',
      props: {
        eventId,
        hostId: pricing.hostId,
        amountCents: breakdown.ticketCents,
        kind: 'ticket',
      },
    },
    user.id,
  );
  redirect(session.url as Route);
}

/**
 * Anonymous (guest) buys a ticket.
 *
 * Anonymous purchasers go through Supabase anonymous auth (per the
 * 20260513001100_anon_auth_pivot migration). We collect a display name +
 * email, mint an anon auth user (or reuse an existing one from cookies),
 * sync the profile, then fall through to the same attendee-based checkout
 * flow as authenticated users.
 */
export async function startGuestTicketCheckout(eventId: string, formData: FormData): Promise<void> {
  if (!isStripeConfigured()) backWithError(eventId, 'payments_off');

  const displayName = field(formData, 'display_name');
  const email = field(formData, 'email').toLowerCase();
  if (!displayName) backWithError(eventId, 'bad_name');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    backWithError(eventId, 'bad_email');
  }

  // Rate-limit the email-bearing path so a bot can't replay the guest
  // checkout form to mail-bomb a target with Supabase confirmation
  // emails. Audit P2 #6.
  const ip = await getClientIp();
  const [ipGate, emailGate] = await Promise.all([
    consumeRateLimit({
      key: rateLimitKey('guest-checkout', 'ip', ip),
      limit: 20,
      windowSeconds: 3600,
    }),
    consumeRateLimit({
      key: rateLimitKey('guest-checkout', 'email', email),
      limit: 5,
      windowSeconds: 3600,
    }),
  ]);
  const blocked = !ipGate.allowed ? ipGate : !emailGate.allowed ? emailGate : null;
  if (blocked) {
    const mins = Math.max(1, Math.ceil(blocked.retryAfterSeconds / 60));
    backWithError(
      eventId,
      'rate_limited',
      `Too many attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
    );
  }

  const supabase = await getServerSupabase();
  const {
    data: { user: existing },
  } = await supabase.auth.getUser();

  if (!existing) {
    const { error: anonErr } = await supabase.auth.signInAnonymously({
      options: { data: { display_name: displayName } },
    });
    if (anonErr) {
      await log.error('[checkout/guest] anon sign-in failed', anonErr, { eventId });
      backWithError(eventId, 'session_failed');
    }
  }

  // Sync display name onto profile (best-effort).
  const {
    data: { user: signedInUser },
  } = await supabase.auth.getUser();
  if (signedInUser) {
    await supabase
      .from('profiles')
      .update({ display_name: displayName } as never)
      .eq('id', signedInUser.id);
    // Attach email so the receipt + future claim flow have it. Don't fail
    // if Supabase rejects it (e.g. address already belongs to another user).
    const { error: emailErr } = await supabase.auth.updateUser({ email });
    if (emailErr && !/already.*registered/i.test(emailErr.message)) {
      log.warn('[checkout/guest] email update failed', { error: emailErr.message });
    }
  }

  // Hand off to the unified attendee checkout. Anon users are allowed.
  await startTicketCheckout(eventId);
}
