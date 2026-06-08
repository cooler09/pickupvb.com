/**
 * `charge.refunded` + `payment_intent.payment_failed` webhook handlers
 * (architecture audit P3-2 — extracted verbatim from the webhook route).
 * Refunds flip the row refunded + delete it so capacity re-opens; failures
 * drop pending reservations. Both are idempotent.
 */
import type Stripe from 'stripe';
import { revalidatePath, updateTag } from 'next/cache';
import { notify } from '@/lib/notify';
import { repositories } from '@/lib/handlers';
import { log } from '@/lib/log';
import { eventCacheTag } from '@/lib/cache-tags';
import {
  refundRosterTeamPaymentIfAny,
  refundTeamRegistrationIfAny,
} from './team-payment-mediators';

/**
 * `payment_intent.payment_failed` — a card declined mid-checkout.
 *
 * Deliberately a no-op. It is **not safe** to release the buyer's pending
 * reservation here: this event fires while the Checkout Session is still
 * `open`, so the buyer can retry with another card and complete on that same
 * session. Deleting the pending row now would lose the seat the subsequent
 * `checkout.session.completed` expects to flip to `paid` — the buyer would be
 * charged but hold nothing. Pending reservations are released only where the
 * session is actually terminal: `checkout.session.expired` (the 30-minute TTL,
 * see CHECKOUT_EXPIRES_SECS) and the explicit cancel route.
 *
 * This previously called `deletePendingAttendeesByPaymentIntent` /
 * `markPendingTipsFailedByPaymentIntent`, but a pending row only ever stores its
 * `checkout_session_id` (the PI is written at completion), so those matched zero
 * rows. They were removed rather than "fixed" into the unsafe eager release
 * above. See docs/audits/stripe-integration.md SI-1.
 */
export async function handlePaymentFailed(_pi: Stripe.PaymentIntent): Promise<void> {
  // Intentionally empty — see the doc comment above.
}

/**
 * Refund issued (manual via Stripe dashboard, or programmatic from a future
 * leave-and-refund action). Mark the row refunded AND delete it so capacity
 * re-opens. Audit-log it.
 */
export async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const piId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  if (!piId) return;

  // Refund could be on a tip or an attendee charge. Try tip first (cheap).
  await repositories.eventPaymentRepo.markTipsRefundedByPaymentIntent(
    piId,
    new Date().toISOString(),
  );

  const att = await repositories.eventPaymentRepo.findRefundableAttendeeByPaymentIntent(piId);
  if (att) {
    const eventId = att.eventId;
    const amountPaid = att.amountPaidCents;
    await repositories.eventPaymentRepo.deleteAttendee(att.participantId);
    await repositories.eventPaymentRepo.recordPaymentAudit({
      eventId,
      userId: att.userId,
      action: 'refunded',
      amountCents: charge.amount_refunded ?? amountPaid,
      paymentIntentId: piId,
    });

    // Notify the attendee. Best-effort; failures don't fail the webhook.
    try {
      const title = (await repositories.eventPaymentRepo.findEventTitle(eventId)) ?? 'event';
      await notify(
        'payment.refunded',
        att.userId,
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

    // The roster row was just deleted — evict the event-detail cache so the
    // page reflects the refund (same webhook-side gap as the buy path; see
    // `handleCheckoutCompleted`). Guarded so it can't fail the webhook.
    try {
      updateTag(eventCacheTag(eventId));
      revalidatePath(`/events/${eventId}`);
    } catch (err) {
      log.warn('[stripe-webhook] event cache revalidate failed (refund)', {
        eventId,
        err: String(err),
      });
    }
  }

  // Team registrations (ADR 0007). The PI id was stored on the aggregate
  // at markPaid; refund flips it to Refunded which is the terminal state.
  await refundTeamRegistrationIfAny(piId, charge.amount_refunded ?? null);
  await refundRosterTeamPaymentIfAny(piId, charge.amount_refunded ?? null);
}

/**
 * `charge.dispute.created` — a buyer filed a chargeback. Stripe withholds the
 * funds and emails the Connect host directly, but we also surface it in-app +
 * email so the host sees it inside PickupVB and knows to respond before the
 * Stripe deadline.
 *
 * We deliberately do **not** auto-free the seat or flip payment state: a dispute
 * can still be won (funds returned), and removing the buyer is the host's call —
 * they're now notified and can refund/remove from the roster if they concede.
 * Covers the ticket + tip surfaces; team-payment disputes still receive Stripe's
 * own email (host-notify for them is a documented follow-up). See
 * docs/audits/stripe-integration.md SI-3.
 */
export async function handleChargeDisputed(dispute: Stripe.Dispute): Promise<void> {
  const piId =
    typeof dispute.payment_intent === 'string'
      ? dispute.payment_intent
      : (dispute.payment_intent?.id ?? null);
  if (!piId) return;

  // Resolve the event + payout host this disputed charge belongs to.
  let eventId: string | null = null;
  let hostId: string | null = null;
  const att = await repositories.eventPaymentRepo.findRefundableAttendeeByPaymentIntent(piId);
  if (att) {
    eventId = att.eventId;
    hostId = await repositories.eventPaymentRepo.findEventHostId(att.eventId);
  } else {
    const tip = await repositories.eventPaymentRepo.findTipContextByPaymentIntent(piId);
    if (tip) {
      eventId = tip.eventId;
      hostId = tip.hostId;
    }
  }
  if (!eventId || !hostId) return;

  const eventTitle = (await repositories.eventPaymentRepo.findEventTitle(eventId)) ?? 'your event';
  try {
    await notify(
      'host.payment.disputed',
      hostId,
      { eventId, eventTitle, amountCents: dispute.amount ?? 0 },
      { idempotencyKey: `dispute:${dispute.id}` },
    );
  } catch {
    // best-effort — a notify failure must never reject the webhook.
  }
}
