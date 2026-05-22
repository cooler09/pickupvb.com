'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import type Stripe from 'stripe';
import {
  EventType,
  PriceUnit,
  TeamRegistrationMode,
  type EventTeamRegistrationId,
} from '@pickupvb/domain';
import { isStripeConfigured } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/supabase';
import { getHostStripeAccount } from '@/lib/host-stripe-account';
import { buildOrigin, redirectEventNotice } from '@/lib/server-redirects';
import { createDestinationCheckoutSession } from '@/lib/checkout-session';
import { platformFeeCentsFor } from '@/lib/event-pricing';
import { repositories } from '@/lib/handlers';
import { log } from '@/lib/log';

function backWithError(eventId: string, code: string, msg?: string): never {
  redirectEventNotice(eventId, 'rsvp', code, msg);
}

/**
 * Captain pays the per-team fee for an ad-hoc team registration (ADR 0007).
 *
 * Flow:
 * 1. Verify viewer is the captain on the named registration.
 * 2. Load the event and the registered division. Require:
 *    - tournament + ad-hoc registration mode
 *    - division priced PerTeam with price > 0
 *    - host has Stripe Connect onboarded (charges_enabled)
 * 3. Create a Stripe Checkout Session whose destination is the host's
 *    Connect account. Metadata routes the resulting webhook back to the
 *    {@link EventTeamRegistration} aggregate by `registration_id`.
 * 4. Aggregate transitions None → Pending via `markCheckoutPending(sessionId)`
 *    and is persisted. If the checkout creation throws, we leave the
 *    aggregate untouched so the captain can retry without going through
 *    `expireCheckout` first.
 * 5. Redirect to Stripe.
 *
 * The webhook (`checkout.session.completed`) finalizes via
 * `markPaid(...)`. On `checkout.session.expired` or
 * `payment_intent.payment_failed` we call `expireCheckout()` so the
 * captain can edit the roster and start a fresh session.
 */
export async function startTeamRegistrationCheckout(registrationId: string): Promise<void> {
  const { eventRepo, eventTeamRegistrationRepo } = repositories;

  // Load the registration first; we need the event id to build flash redirects.
  const registration = await eventTeamRegistrationRepo.findById(
    registrationId as never as EventTeamRegistrationId,
  );
  if (!registration) {
    // Without an event id we can't redirect to the event page; bounce home.
    redirect('/' as Route);
  }
  const eventId = registration.eventId;

  if (!isStripeConfigured()) backWithError(eventId, 'payments_off');

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) backWithError(eventId, 'signin');
  if (String(registration.captainId) !== user.id) {
    backWithError(eventId, 'forbidden');
  }

  // Idempotency / guards on the aggregate's payment status.
  if (registration.paymentStatus === 'paid') {
    backWithError(eventId, 'already');
  }
  if (registration.paymentStatus === 'refunded') {
    backWithError(eventId, 'refunded');
  }

  const event = await eventRepo.findById(eventId);
  if (!event) backWithError(eventId, 'event_not_found');
  if (event.type !== EventType.Tournament) {
    backWithError(eventId, 'not_tournament');
  }
  if (event.teamRegistrationMode !== TeamRegistrationMode.AdHoc) {
    backWithError(eventId, 'not_team_event');
  }

  const division = event.divisions.find((d) => String(d.id) === String(registration.divisionId));
  if (!division) backWithError(eventId, 'division_not_found');
  if (division.priceUnit !== PriceUnit.PerTeam) {
    // Per-player priced divisions go through the attendee flow, not here.
    backWithError(eventId, 'not_per_team');
  }
  const priceCents = division.priceCents ?? 0;
  if (priceCents <= 0) {
    backWithError(eventId, 'free_event');
  }

  const hostAccountId = await getHostStripeAccount(event.hostId as unknown as string);
  if (!hostAccountId) backWithError(eventId, 'host_not_ready');

  // host_absorbs_fee mirrors the attendee flow. Pull it via the supabase
  // session client (RLS lets anyone read events).
  const { data: feeRow } = await supabase
    .from('events')
    .select('host_absorbs_fee')
    .eq('id', eventId)
    .maybeSingle();
  const hostAbsorbsFee =
    (feeRow as { host_absorbs_fee: boolean } | null)?.host_absorbs_fee ?? false;

  const hostId = event.hostId as unknown as string;
  const platformFee = await platformFeeCentsFor(hostId, priceCents);
  const buyerFeeLine = hostAbsorbsFee ? 0 : platformFee;
  const applicationFeeAmount = platformFee;

  const origin = await buildOrigin();
  const safeName = division.label.trim() || 'Division';

  let session: Stripe.Checkout.Session;
  try {
    session = await createDestinationCheckoutSession({
      destinationAccountId: hostAccountId,
      applicationFeeAmount,
      customerEmail: user.email ?? null,
      lineItems: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: priceCents,
            product_data: {
              name: `Team entry — ${safeName}`,
              description: registration.name,
            },
          },
        },
        ...(buyerFeeLine > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: 'usd' as const,
                  unit_amount: buyerFeeLine,
                  product_data: { name: 'Service fee' },
                },
              },
            ]
          : []),
      ],
      successUrl: `${origin}/events/${eventId}/team-checkout/success?session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/events/${eventId}/team-checkout/cancel?session={CHECKOUT_SESSION_ID}`,
      metadata: {
        kind: 'team_registration',
        event_id: eventId,
        registration_id: String(registration.id),
        captain_id: user.id,
      },
    });
  } catch (err) {
    await log.error('[team-checkout] session create failed', err, {
      eventId,
      registrationId: String(registration.id),
    });
    const m = err instanceof Error ? err.message : 'Could not start checkout.';
    backWithError(eventId, 'error', m);
  }

  if (!session.url) backWithError(eventId, 'error', 'Stripe did not return a URL.');

  // Aggregate transition: None → Pending. Throws InvariantViolation if the
  // status changed underneath us (e.g. parallel tab already started one);
  // surface that as 'already' so the captain can refresh.
  try {
    registration.markCheckoutPending(session.id);
    await eventTeamRegistrationRepo.save(registration);
  } catch (err) {
    await log.error('[team-checkout] persist pending failed', err, {
      eventId,
      registrationId: String(registration.id),
      sessionId: session.id,
    });
    backWithError(eventId, 'error', 'Could not record checkout. Please retry.');
  }

  // No `revalidatePath` here: payment hasn't completed yet. The Stripe
  // `checkout.session.completed` webhook revalidates once the team
  // registration is marked paid.
  redirect(session.url as Route);
}
