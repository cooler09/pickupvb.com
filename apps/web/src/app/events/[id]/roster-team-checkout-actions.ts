'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import type Stripe from 'stripe';
import {
  EventTeamPayment,
  EventType,
  PriceUnit,
  RegistrationPaymentStatus,
  TeamRegistrationMode,
  EventTeamPaymentId,
  type UserId,
} from '@pickupvb/domain';
import { isStripeConfigured } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/supabase';
import { getHostStripeAccount } from '@/lib/host-stripe-account';
import { buildOrigin, redirectEventNotice } from '@/lib/server-redirects';
import { createDestinationCheckoutSession } from '@/lib/checkout-session';
import { buyerProcessingFeeCents, platformFeeCentsFor } from '@/lib/event-pricing';
import { repositories } from '@/lib/handlers';
import { analytics } from '@/lib/handlers';
import { log } from '@/lib/log';

function backWithError(eventId: string, code: string, msg?: string): never {
  redirectEventNotice(eventId, 'rsvp', code, msg);
}

/**
 * Captain pays the per-team fee for a roster-mode tournament team (ADR 0007).
 *
 * Sibling of {@link startTeamRegistrationCheckout}, which handles the
 * ad-hoc mode (captain assembled a roster at signup time). Roster-mode
 * teams are persistent (live in `teams`) and register through
 * `event_teams`; the payment side-channel is the {@link EventTeamPayment}
 * aggregate persisted to `event_team_payments`.
 *
 * Flow:
 * 1. Verify viewer is signed in and is the captain of the named team.
 * 2. Verify the team is registered for the event (row in `event_teams`).
 * 3. Load the event and the registered division. Require:
 *    - tournament + roster registration mode + on-platform payments
 *    - division priced PerTeam with price > 0
 *    - host has Stripe Connect onboarded
 * 4. Find-or-create the EventTeamPayment row; guard already-paid/refunded.
 * 5. Create a destination Checkout Session with metadata
 *    `{kind:'roster_team_payment', event_id, team_id, payment_id, captain_id}`.
 * 6. Aggregate None → Pending; persist.
 * 7. Redirect to Stripe.
 */
export async function startRosterTeamCheckout(eventId: string, teamId: string): Promise<void> {
  const { eventRepo, eventTeamPaymentRepo } = repositories;

  if (!isStripeConfigured()) backWithError(eventId, 'payments_off');

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) backWithError(eventId, 'signin');

  // Verify team registration + captain ownership via two read queries.
  const { data: teamRow } = await supabase
    .from('teams')
    .select('id, name, captain_id')
    .eq('id', teamId)
    .maybeSingle();
  const team = teamRow as { id: string; name: string; captain_id: string } | null;
  if (!team) backWithError(eventId, 'team_not_found');
  if (team.captain_id !== user.id) backWithError(eventId, 'forbidden');

  const { data: regRow } = await supabase
    .from('event_team_entries')
    .select(
      'id, team_id, division_id, division:event_divisions!event_team_entries_division_id_fkey!inner(event_id)',
    )
    .eq('division.event_id', eventId)
    .eq('team_id', teamId)
    .eq('source', 'roster')
    .is('deleted_at', null)
    .maybeSingle();
  const registration = regRow as {
    id: string;
    team_id: string;
    division_id: string | null;
    division: { event_id: string } | null;
  } | null;
  if (!registration) backWithError(eventId, 'team_not_registered');
  if (!registration.division_id) backWithError(eventId, 'division_not_found');

  const event = await eventRepo.findById(eventId);
  if (!event) backWithError(eventId, 'event_not_found');
  if (event.type !== EventType.Tournament) backWithError(eventId, 'not_tournament');
  if (event.paymentsOffPlatform) backWithError(eventId, 'payments_off');

  const division = event.divisions.find((d) => String(d.id) === registration.division_id);
  if (!division) backWithError(eventId, 'division_not_found');
  if (division.teamRegistrationMode !== TeamRegistrationMode.Roster) {
    backWithError(eventId, 'not_team_event');
  }
  if (division.priceUnit !== PriceUnit.PerTeam) backWithError(eventId, 'not_per_team');
  const priceCents = division.priceCents ?? 0;
  if (priceCents <= 0) backWithError(eventId, 'free_event');

  // Find-or-create the payment aggregate.
  let payment = await eventTeamPaymentRepo.findByEventAndTeam(eventId, teamId);
  if (payment && payment.paymentStatus === RegistrationPaymentStatus.Paid) {
    backWithError(eventId, 'already');
  }
  if (payment && payment.paymentStatus === RegistrationPaymentStatus.Refunded) {
    backWithError(eventId, 'refunded');
  }
  if (!payment) {
    payment = EventTeamPayment.create({
      id: EventTeamPaymentId(crypto.randomUUID()),
      eventId,
      teamId,
      captainId: user.id as UserId,
    });
  } else if (payment.paymentStatus === RegistrationPaymentStatus.Pending) {
    // Reset so we can start a fresh session; the old one may be expired.
    payment.expireCheckout();
  }

  const hostAccountId = await getHostStripeAccount(event.hostId as unknown as string);
  if (!hostAccountId) backWithError(eventId, 'host_not_ready');

  const { data: feeRow } = await supabase
    .from('events')
    .select('host_absorbs_fee, pass_processing_fee_to_buyer')
    .eq('id', eventId)
    .maybeSingle();
  const feeFlags = feeRow as {
    host_absorbs_fee: boolean;
    pass_processing_fee_to_buyer: boolean;
  } | null;
  const hostAbsorbsFee = feeFlags?.host_absorbs_fee ?? false;
  const passProcessingFeeToBuyer = feeFlags?.pass_processing_fee_to_buyer ?? false;

  const hostId = event.hostId as unknown as string;
  const platformFee = await platformFeeCentsFor(hostId, priceCents);
  const buyerFeeLine = hostAbsorbsFee ? 0 : platformFee;
  const processingFeeLine = buyerProcessingFeeCents({
    passToBuyer: passProcessingFeeToBuyer,
    hostAbsorbs: hostAbsorbsFee,
    subtotalCents: priceCents + buyerFeeLine,
  });
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
              description: team.name,
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
        ...(processingFeeLine > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: 'usd' as const,
                  unit_amount: processingFeeLine,
                  product_data: { name: 'Processing fee' },
                },
              },
            ]
          : []),
      ],
      successUrl: `${origin}/events/${eventId}/roster-team-checkout/success?session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/events/${eventId}/roster-team-checkout/cancel?session={CHECKOUT_SESSION_ID}`,
      metadata: {
        kind: 'roster_team_payment',
        event_id: eventId,
        team_id: teamId,
        payment_id: String(payment.id),
        captain_id: user.id,
      },
      // One pending roster payment row → at most one Checkout Session (TPI-5).
      idempotencyKey: `roster:${String(payment.id)}`,
    });
  } catch (err) {
    await log.error('[roster-team-checkout] session create failed', err, {
      eventId,
      teamId,
      paymentId: String(payment.id),
    });
    const m = err instanceof Error ? err.message : 'Could not start checkout.';
    backWithError(eventId, 'error', m);
  }

  if (!session.url) backWithError(eventId, 'error', 'Stripe did not return a URL.');

  try {
    payment.markCheckoutPending(session.id);
    await eventTeamPaymentRepo.save(payment);
  } catch (err) {
    await log.error('[roster-team-checkout] persist pending failed', err, {
      eventId,
      teamId,
      paymentId: String(payment.id),
      sessionId: session.id,
    });
    backWithError(eventId, 'error', 'Could not record checkout. Please retry.');
  }

  // Webhook revalidates after `checkout.session.completed`.
  analytics.capture(
    {
      name: 'checkout_started',
      props: {
        eventId,
        hostId,
        amountCents: priceCents,
        kind: 'team',
      },
    },
    user.id,
  );
  redirect(session.url as Route);
}
