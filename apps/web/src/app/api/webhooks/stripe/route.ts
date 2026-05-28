import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import {
  InvariantViolation,
  RegistrationPaymentStatus,
  type EventTeamPaymentId,
  type EventTeamRegistrationId,
} from '@pickupvb/domain';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { mirrorStripeAccountUpdate } from '@/lib/host-stripe-account';
import { findHostByStripeCustomerId, upsertHostSubscriptionFromStripe } from '@/lib/pro';
import { repositories, analytics } from '@/lib/handlers';
import { log } from '@/lib/log';
import { notify } from '@/lib/notify';

/**
 * Stripe webhook receiver.
 *
 * Stripe POSTs JSON events here. We:
 *   1. Verify the signature using `STRIPE_WEBHOOK_SECRET`.
 *   2. Insert the event id into `stripe_webhook_events` to dedupe redeliveries
 *      (Stripe retries up to 3 days). A unique violation means we've already
 *      processed this event — return 200 immediately.
 *   3. Dispatch to a per-type handler. Each handler is responsible for its own
 *      idempotency at the data layer (e.g. don't double-credit an attendee).
 *   4. Mark `processed_at` so the log is queryable for incident response.
 *
 * Phase 1: only `account.updated` is handled (mirrors Stripe Connect
 * onboarding state into `host_stripe_accounts`). Phase 2 will add
 * `checkout.session.completed`, `charge.refunded`, etc.
 *
 * Phase 1 invariants:
 *   - This endpoint MUST be reachable without authentication.
 *   - It MUST return 200 within Stripe's 30s budget. If processing takes
 *     longer, queue work and return early. (Today every handler is fast.)
 *   - It MUST NOT return 5xx for "expected" failures (signature mismatch,
 *     unknown event type) — those are 4xx so Stripe doesn't retry forever.
 */

// Body must be the raw text — signature verification needs byte-exact input.
export const dynamic = 'force-dynamic';
// Edge runtime can't access node `crypto` Stripe needs; keep on Node.
export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'STRIPE_NOT_CONFIGURED' }, { status: 503 });
  }
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
  if (!webhookSecret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET_MISSING' }, { status: 503 });
  }

  const sig = (await headers()).get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'MISSING_SIGNATURE' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    // Bad signature — bail with 400 so Stripe stops retrying.
    await log.error('[stripe-webhook] signature verification failed', err);
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  // Idempotency: upsert with `ignoreDuplicates`. On first sight the row is
  // inserted and `.select()` returns it; on a redelivery the unique
  // constraint on `id` short-circuits Postgres' insert path without raising
  // an exception, so `.select()` returns an empty array. Cheaper than the
  // previous insert-and-catch (`23505`) pattern by ~5–20 ms per retry —
  // see performance audit P2 #9.
  const admin = getAdminSupabase();
  const { data: insertedRows, error: insertErr } = await admin
    .from('stripe_webhook_events')
    .upsert({ id: event.id, event_type: event.type } as never, {
      onConflict: 'id',
      ignoreDuplicates: true,
    })
    .select('id');
  if (insertErr) {
    await log.error('[stripe-webhook] insert log failed', insertErr, {
      eventId: event.id,
      eventType: event.type,
    });
    // Return 500 so Stripe retries; we'd rather process twice than not at
    // all (downstream handlers are idempotent).
    return NextResponse.json({ error: 'LOG_FAILED' }, { status: 500 });
  }
  if (!insertedRows || insertedRows.length === 0) {
    // Row already existed — duplicate delivery. Return 200 so Stripe
    // stops retrying.
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    await dispatch(event);
  } catch (err) {
    await log.error('[stripe-webhook] handler threw', err, {
      eventId: event.id,
      eventType: event.type,
    });
    // Don't mark processed_at — Stripe will retry, we'll dedupe via
    // unique key on next attempt only AFTER... wait, we already inserted.
    // Delete the log row so the retry isn't deduped.
    await admin.from('stripe_webhook_events').delete().eq('id', event.id);
    return NextResponse.json({ error: 'HANDLER_FAILED' }, { status: 500 });
  }

  await admin
    .from('stripe_webhook_events')
    .update({ processed_at: new Date().toISOString() } as never)
    .eq('id', event.id);

  return NextResponse.json({ ok: true });
}

/**
 * Per-type dispatch. Throw to signal a retryable failure; return cleanly to
 * mark processed. Unknown events are no-ops (Stripe sends a lot we don't
 * subscribe to, depending on dashboard configuration).
 */
async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'account.updated':
      await handleAccountUpdated(event.data.object as Stripe.Account);
      return;
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case 'checkout.session.expired':
      await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
      return;
    case 'charge.refunded':
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      return;
    case 'payout.paid':
      await handlePayoutPaid(event.data.object as Stripe.Payout, event.account ?? null);
      return;
    case 'payment_intent.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
      return;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChange(
        event.data.object as Stripe.Subscription,
        event.type,
        (event.data as { previous_attributes?: Partial<Stripe.Subscription> }).previous_attributes,
      );
      return;
    default:
      // No-op for events we don't subscribe to. Returning here marks
      // them as processed in our log; that's fine.
      return;
  }
}

/**
 * Mirror Stripe Connect account state into our `host_stripe_accounts` table.
 * Fired by Stripe whenever the account changes (KYC submission, capability
 * grants, requirements added/removed). The fields we care about let us
 * gate the "publish a paid event" UI.
 */
async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
  await mirrorStripeAccountUpdate(account.id, {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  });
  // Repo returns false (no row) silently — host hasn't onboarded through
  // our flow yet, so there's nothing to mirror.

  // Fire host_payout_setup_completed whenever the account is currently
  // charges-enabled. Stripe re-sends account.updated on every change
  // (re-verification, capability shifts), so PostHog will see repeats —
  // dashboards filter to first occurrence per actor. Acceptable for now;
  // tightening to first-transition would require comparing prior mirror
  // state (deferred).
  if (account.charges_enabled) {
    const admin = getAdminSupabase();
    const { data } = await admin
      .from('host_stripe_accounts')
      .select('user_id')
      .eq('stripe_account_id', account.id)
      .maybeSingle();
    const hostId = (data as { user_id: string } | null)?.user_id ?? null;
    if (hostId) {
      analytics.capture({ name: 'host_payout_setup_completed', props: { hostId } }, hostId);
    }
  }
}

// ============================================================================
// Ticketed-event handlers (Phase 2)
// ============================================================================

type CheckoutMetadata = {
  event_id?: string;
  user_id?: string;
  host_id?: string;
  tip_id?: string;
  registration_id?: string;
  team_id?: string;
  payment_id?: string;
  captain_id?: string;
  sponsor_name?: string;
  sponsor_blurb?: string;
  sponsor_link_url?: string;
  sponsor_logo_url?: string;
  sponsor_discount_code?: string;
  kind?: 'attendee' | 'tip' | 'team_registration' | 'roster_team_payment' | 'sponsor_slot';
};

/**
 * Customer completed payment. Find the reservation row by checkout_session_id
 * (or by metadata as fallback) and flip it to `paid`. Audit-log the event.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const meta = (session.metadata ?? {}) as CheckoutMetadata;
  if (!meta.event_id || !meta.kind) return;

  // Defense-in-depth: if `session.customer` is expanded and carries its own
  // user_id metadata, reject when it disagrees with the session metadata.
  // Guards against a misconfigured Stripe Dashboard rule mass-rewriting
  // customer metadata. See docs/audits/security.md P2 #7.
  if (
    meta.user_id &&
    session.customer &&
    typeof session.customer !== 'string' &&
    !session.customer.deleted
  ) {
    const customerUserId = session.customer.metadata?.['user_id'];
    if (customerUserId && customerUserId !== meta.user_id) {
      await log.error('[stripe-webhook] metadata user_id mismatch (session vs customer)', null, {
        sessionId: session.id,
        sessionUserId: meta.user_id,
        customerUserId,
      });
      throw new Error('metadata user_id mismatch');
    }
  }

  const admin = getAdminSupabase();
  const paidAt = new Date().toISOString();
  const piId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  const amountTotal = session.amount_total ?? 0;

  if (meta.kind === 'attendee' && meta.user_id) {
    // The pending payment row was stamped with checkout_session_id at
    // checkout creation; key off it.
    const { error } = await admin
      .from('event_participant_payments')
      .update({
        payment_status: 'paid',
        payment_intent_id: piId,
        amount_paid_cents: amountTotal,
        paid_at: paidAt,
      } as never)
      .eq('checkout_session_id', session.id);
    if (error) throw new Error(`mark attendee paid failed: ${error.message}`);

    await admin.from('event_payment_audit').insert({
      event_id: meta.event_id,
      user_id: meta.user_id,
      action: 'paid',
      amount_cents: amountTotal,
      payment_intent_id: piId,
    } as never);

    const hostId = meta.host_id ?? (await lookupHostId(meta.event_id));
    if (hostId) {
      analytics.capture(
        {
          name: 'checkout_completed',
          props: {
            eventId: meta.event_id,
            hostId,
            amountCents: amountTotal,
            kind: 'ticket',
            paymentIntentId: piId ?? '',
          },
        },
        meta.user_id,
      );
    }
  }

  if (meta.kind === 'tip' && meta.tip_id) {
    const { error } = await admin
      .from('event_tips')
      .update({
        status: 'paid',
        stripe_payment_intent_id: piId,
        paid_at: paidAt,
      } as never)
      .eq('id', meta.tip_id);
    if (error) throw new Error(`mark tip paid failed: ${error.message}`);

    const hostId = meta.host_id ?? (await lookupHostId(meta.event_id));
    if (hostId && meta.user_id) {
      analytics.capture(
        {
          name: 'checkout_completed',
          props: {
            eventId: meta.event_id,
            hostId,
            amountCents: amountTotal,
            kind: 'tip',
            paymentIntentId: piId ?? '',
          },
        },
        meta.user_id,
      );
    }
  }

  if (meta.kind === 'team_registration' && meta.registration_id) {
    if (!piId) {
      log.warn('webhook.team_registration.missing_pi', {
        registrationId: meta.registration_id,
      });
      return;
    }
    await markTeamRegistrationPaid({
      registrationId: meta.registration_id,
      paymentIntentId: piId,
      amountCents: amountTotal,
      paidAt: new Date(paidAt),
    });
    const hostId = meta.host_id ?? (await lookupHostId(meta.event_id));
    if (hostId && meta.captain_id) {
      analytics.capture(
        {
          name: 'checkout_completed',
          props: {
            eventId: meta.event_id,
            hostId,
            amountCents: amountTotal,
            kind: 'team',
            paymentIntentId: piId,
          },
        },
        meta.captain_id,
      );
    }
  }

  if (meta.kind === 'roster_team_payment' && meta.payment_id) {
    if (!piId) {
      log.warn('webhook.roster_team_payment.missing_pi', {
        paymentId: meta.payment_id,
      });
      return;
    }
    await markRosterTeamPaymentPaid({
      paymentId: meta.payment_id,
      paymentIntentId: piId,
      amountCents: amountTotal,
      paidAt: new Date(paidAt),
    });
    const hostId = meta.host_id ?? (await lookupHostId(meta.event_id));
    if (hostId && meta.captain_id) {
      analytics.capture(
        {
          name: 'checkout_completed',
          props: {
            eventId: meta.event_id,
            hostId,
            amountCents: amountTotal,
            kind: 'team',
            paymentIntentId: piId,
          },
        },
        meta.captain_id,
      );
    }
  }

  if (meta.kind === 'sponsor_slot' && meta.user_id) {
    const sponsorName = (meta.sponsor_name ?? '').trim();
    if (!sponsorName) return;

    const sponsorBlurb = (meta.sponsor_blurb ?? '').trim() || null;
    const sponsorLinkUrl = (meta.sponsor_link_url ?? '').trim() || null;
    const sponsorLogoUrl = (meta.sponsor_logo_url ?? '').trim() || null;
    const sponsorDiscountCode = (meta.sponsor_discount_code ?? '').trim() || null;

    const { error } = await admin.from('event_sponsors').upsert(
      {
        event_id: meta.event_id,
        name: sponsorName,
        blurb: sponsorBlurb,
        link_url: sponsorLinkUrl,
        logo_url: sponsorLogoUrl,
        discount_code: sponsorDiscountCode,
        access_kind: 'ala_carte',
        purchased_by_user_id: meta.user_id,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: piId,
        paid_at: paidAt,
      } as never,
      { onConflict: 'event_id' },
    );
    if (error) throw new Error(`mark sponsor slot paid failed: ${error.message}`);

    const hostId = meta.host_id ?? (await lookupHostId(meta.event_id));
    if (hostId) {
      analytics.capture(
        {
          name: 'checkout_completed',
          props: {
            eventId: meta.event_id,
            hostId,
            amountCents: amountTotal,
            kind: 'sponsor_slot',
            paymentIntentId: piId ?? '',
          },
        },
        meta.user_id,
      );
    }
  }
}

/**
 * Look up the host_id for an event. Used by webhook capture sites that
 * don't have it in metadata. Returns null silently if the event has been
 * deleted between checkout creation and webhook delivery.
 */
async function lookupHostId(eventId: string): Promise<string | null> {
  const admin = getAdminSupabase();
  const { data } = await admin.from('events').select('host_id').eq('id', eventId).maybeSingle();
  return (data as { host_id: string } | null)?.host_id ?? null;
}

/**
 * Checkout session expired (30-min default) without a successful payment.
 * Drop the pending reservation so the spot opens back up.
 */
async function handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
  const meta = (session.metadata ?? {}) as CheckoutMetadata;
  if (!meta.event_id || !meta.kind) return;
  const admin = getAdminSupabase();

  if (meta.kind === 'attendee' && meta.user_id) {
    // Delete the pending participant; payment row cascades. Look it up
    // by checkout_session_id on the payment side first.
    const { data: payRow } = await admin
      .from('event_participant_payments')
      .select('participant_id')
      .eq('checkout_session_id', session.id)
      .eq('payment_status', 'pending')
      .maybeSingle();
    const pid = (payRow as { participant_id: string } | null)?.participant_id;
    if (pid) {
      await admin.from('event_participants').delete().eq('id', pid);
    }
  }

  if (meta.kind === 'tip' && meta.tip_id) {
    // Drop pending tip rows on expiry; failed payments hit payment_failed
    // separately.
    await admin.from('event_tips').delete().eq('id', meta.tip_id).eq('status', 'pending');
  }

  if (meta.kind === 'team_registration' && meta.registration_id) {
    await expireTeamRegistrationCheckout(meta.registration_id);
  }

  if (meta.kind === 'roster_team_payment' && meta.payment_id) {
    await expireRosterTeamPaymentCheckout(meta.payment_id);
  }
}

/**
 * Same cleanup as expired — bare payment_intent.payment_failed events fire
 * when the customer's card declines mid-checkout. We don't always get a
 * matching session here (Stripe sends both), but cleanup is idempotent.
 */
async function handlePaymentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const admin = getAdminSupabase();
  // Drop pending attendee reservations attached to this PI. Look up via
  // payments table, then delete the participant (payment cascades).
  const { data: pendingPay } = await admin
    .from('event_participant_payments')
    .select('participant_id')
    .eq('payment_intent_id', pi.id)
    .eq('payment_status', 'pending');
  const pids = ((pendingPay as { participant_id: string }[] | null) ?? []).map(
    (r) => r.participant_id,
  );
  if (pids.length > 0) {
    await admin.from('event_participants').delete().in('id', pids);
  }
  // Tips: mark failed rather than delete so the host can see attempted tips.
  await admin
    .from('event_tips')
    .update({ status: 'failed' } as never)
    .eq('stripe_payment_intent_id', pi.id)
    .eq('status', 'pending');
}

/**
 * Refund issued (manual via Stripe dashboard, or programmatic from a future
 * leave-and-refund action). Mark the row refunded AND delete it so capacity
 * re-opens. Audit-log it.
 */
async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const piId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  if (!piId) return;

  const admin = getAdminSupabase();

  // Refund could be on a tip or an attendee charge. Try tip first (cheap).
  await admin
    .from('event_tips')
    .update({
      status: 'refunded',
      refunded_at: new Date().toISOString(),
    } as never)
    .eq('stripe_payment_intent_id', piId);

  const { data: attendeeRow } = await admin
    .from('event_participants')
    .select(
      'id, user_id, payment:event_participant_payments!inner(amount_paid_cents, payment_intent_id), division:event_divisions!inner(event_id)',
    )
    .eq('role', 'attendee')
    .eq('payment.payment_intent_id', piId)
    .maybeSingle();
  type AttRow = {
    id: string;
    user_id: string;
    payment: { amount_paid_cents: number } | null;
    division: { event_id: string } | null;
  };
  const att = attendeeRow as unknown as AttRow | null;
  if (att && att.division) {
    const eventId = att.division.event_id;
    const amountPaid = att.payment?.amount_paid_cents ?? 0;
    await admin.from('event_participants').delete().eq('id', att.id);
    await admin.from('event_payment_audit').insert({
      event_id: eventId,
      user_id: att.user_id,
      action: 'refunded',
      amount_cents: charge.amount_refunded ?? amountPaid,
      payment_intent_id: piId,
    } as never);

    // Notify the attendee. Best-effort; failures don't fail the webhook.
    try {
      const { data: evRow } = await admin
        .from('events')
        .select('title')
        .eq('id', eventId)
        .maybeSingle();
      const title = (evRow as { title: string } | null)?.title ?? 'event';
      await notify(
        'payment.refunded',
        att.user_id,
        {
          eventId,
          eventTitle: title,
          amountCents: charge.amount_refunded ?? amountPaid,
        },
        { idempotencyKey: `refund:${piId}` },
      );
    } catch {
      // best-effort
    }
  }

  // Team registrations (ADR 0007). The PI id was stored on the aggregate
  // at markPaid; refund flips it to Refunded which is the terminal state.
  await refundTeamRegistrationIfAny(piId, charge.amount_refunded ?? null);
  await refundRosterTeamPaymentIfAny(piId, charge.amount_refunded ?? null);
}

// ----------------------------------------------------------------------------
// Team registration helpers (ADR 0007). Mediated through the aggregate so
// invariants (state machine, idempotency) stay in one place.
// ----------------------------------------------------------------------------

async function markTeamRegistrationPaid(args: {
  registrationId: string;
  paymentIntentId: string;
  amountCents: number;
  paidAt: Date;
}): Promise<void> {
  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findById(
    args.registrationId as never as EventTeamRegistrationId,
  );
  if (!reg) {
    log.warn('webhook.team_registration.missing', { registrationId: args.registrationId });
    return;
  }
  if (reg.paymentStatus === RegistrationPaymentStatus.Paid) return;
  try {
    reg.markPaid({
      paymentIntentId: args.paymentIntentId,
      amountCents: args.amountCents,
      paidAt: args.paidAt,
    });
    await eventTeamRegistrationRepo.save(reg);
  } catch (err) {
    // Refunded → Paid would violate the invariant; treat as idempotent.
    if (err instanceof InvariantViolation) return;
    throw err;
  }
}

async function expireTeamRegistrationCheckout(registrationId: string): Promise<void> {
  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findById(
    registrationId as never as EventTeamRegistrationId,
  );
  if (!reg) return;
  reg.expireCheckout(); // no-op unless Pending
  await eventTeamRegistrationRepo.save(reg);
}

async function refundTeamRegistrationIfAny(
  paymentIntentId: string,
  _amountRefundedCents: number | null,
): Promise<void> {
  const { eventTeamRegistrationRepo } = repositories;
  const reg = await eventTeamRegistrationRepo.findByPaymentIntentId(paymentIntentId);
  if (!reg) return;
  if (reg.paymentStatus !== RegistrationPaymentStatus.Paid) return;
  reg.markRefunded();
  await eventTeamRegistrationRepo.save(reg);
}

// ----------------------------------------------------------------------------
// Roster-mode per-team payment helpers (ADR 0007 — Bundle 4). Sidecar to
// the persistent team registration in `event_teams`; mediated through the
// {@link EventTeamPayment} aggregate.
// ----------------------------------------------------------------------------

async function markRosterTeamPaymentPaid(args: {
  paymentId: string;
  paymentIntentId: string;
  amountCents: number;
  paidAt: Date;
}): Promise<void> {
  const { eventTeamPaymentRepo } = repositories;
  const payment = await eventTeamPaymentRepo.findById(
    args.paymentId as never as EventTeamPaymentId,
  );
  if (!payment) {
    log.warn('webhook.roster_team_payment.missing', { paymentId: args.paymentId });
    return;
  }
  if (payment.paymentStatus === RegistrationPaymentStatus.Paid) return;
  try {
    payment.markPaid({
      paymentIntentId: args.paymentIntentId,
      amountCents: args.amountCents,
      paidAt: args.paidAt,
    });
    await eventTeamPaymentRepo.save(payment);
  } catch (err) {
    if (err instanceof InvariantViolation) return;
    throw err;
  }
}

async function expireRosterTeamPaymentCheckout(paymentId: string): Promise<void> {
  const { eventTeamPaymentRepo } = repositories;
  const payment = await eventTeamPaymentRepo.findById(paymentId as never as EventTeamPaymentId);
  if (!payment) return;
  payment.expireCheckout();
  await eventTeamPaymentRepo.save(payment);
}

async function refundRosterTeamPaymentIfAny(
  paymentIntentId: string,
  _amountRefundedCents: number | null,
): Promise<void> {
  const { eventTeamPaymentRepo } = repositories;
  const payment = await eventTeamPaymentRepo.findByPaymentIntentId(paymentIntentId);
  if (!payment) return;
  if (payment.paymentStatus !== RegistrationPaymentStatus.Paid) return;
  payment.markRefunded();
  await eventTeamPaymentRepo.save(payment);
}

// ============================================================================
// Pro Host subscription handlers (Phase 3)
// ============================================================================

/**
 * Connect payout settled to the host's bank. Notify them with the amount
 * and expected arrival date so they don't have to babysit their dashboard.
 *
 * `event.account` is the connected account id (acct_...) — Stripe sends
 * Connect events with this top-level field populated.
 */
async function handlePayoutPaid(payout: Stripe.Payout, accountId: string | null): Promise<void> {
  if (!accountId) return;
  const admin = getAdminSupabase();
  const { data: row } = await admin
    .from('host_stripe_accounts')
    .select('user_id')
    .eq('stripe_account_id', accountId)
    .maybeSingle();
  const userId = (row as { user_id: string } | null)?.user_id;
  if (!userId) return;
  const arrivalDate = payout.arrival_date
    ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
    : 'soon';
  try {
    await notify(
      'host.payout.paid',
      userId,
      { amountCents: payout.amount, arrivalDate },
      { idempotencyKey: `payout:${payout.id}` },
    );
  } catch {
    // best-effort
  }
}

/**
 * Keep host_subscriptions in sync with Stripe. Fires on create/update/delete
 * so a single handler covers trial start, payment success, cancellation,
 * past_due, and end-of-period cancel.
 */
async function handleSubscriptionChange(
  sub: Stripe.Subscription,
  eventType:
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted',
  previousAttributes?: Partial<Stripe.Subscription>,
): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // Resolve user_id: prefer subscription metadata, then customer metadata,
  // then fall back to our existing row keyed by customer id. When both
  // subscription and (expanded) customer metadata carry a user_id, reject
  // mismatches — see docs/audits/security.md P2 #7.
  const subUserId = (sub.metadata?.['user_id'] as string | undefined) ?? undefined;
  const customerUserId =
    typeof sub.customer !== 'string' && !sub.customer.deleted
      ? ((sub.customer.metadata?.['user_id'] as string | undefined) ?? undefined)
      : undefined;
  if (subUserId && customerUserId && subUserId !== customerUserId) {
    await log.error('[stripe-webhook] metadata user_id mismatch (subscription vs customer)', null, {
      subscriptionId: sub.id,
      subUserId,
      customerUserId,
    });
    throw new Error('metadata user_id mismatch');
  }
  let userId = subUserId ?? customerUserId;
  if (!userId) {
    userId = (await findHostByStripeCustomerId(customerId)) ?? undefined;
  }
  if (!userId) {
    await log.error('[stripe-webhook] subscription change: no user_id resolvable', null, {
      subscriptionId: sub.id,
      customerId,
    });
    return;
  }

  // Derive plan from the first item's price id.
  const priceId = sub.items.data[0]?.price.id ?? null;
  const plan =
    priceId === process.env['STRIPE_PRO_YEARLY_PRICE_ID']
      ? 'yearly'
      : priceId === process.env['STRIPE_PRO_MONTHLY_PRICE_ID']
        ? 'monthly'
        : null;

  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
  const trialEnd = sub.trial_end;

  await upsertHostSubscriptionFromStripe({
    hostId: userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    status: sub.status,
    plan,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    trialEnd: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
  });

  // Pro funnel analytics (audit P2 #5). Fires after the DB row is up to
  // date so downstream queries match the captured event. Failures inside
  // `analytics.capture` are swallowed by the adapter — never block a
  // webhook on telemetry.
  if (eventType === 'customer.subscription.created' && sub.status === 'trialing') {
    analytics.capture(
      {
        name: 'pro_trial_started',
        props: {
          hostId: userId,
          plan,
          trialEnd: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
        },
      },
      userId,
    );
  } else if (
    eventType === 'customer.subscription.updated' &&
    previousAttributes?.status === 'trialing' &&
    sub.status === 'active'
  ) {
    analytics.capture(
      {
        name: 'pro_trial_converted',
        props: { hostId: userId, plan },
      },
      userId,
    );
  }
}
