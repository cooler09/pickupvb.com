/**
 * `charge.refunded` + `payment_intent.payment_failed` webhook handlers
 * (architecture audit P3-2 — extracted verbatim from the webhook route).
 * Refunds flip the row refunded + delete it so capacity re-opens; failures
 * drop pending reservations. Both are idempotent.
 */
import type Stripe from 'stripe';
import { notify } from '@/lib/notify';
import { repositories } from '@/lib/handlers';
import {
  refundRosterTeamPaymentIfAny,
  refundTeamRegistrationIfAny,
} from './team-payment-mediators';

/**
 * Same cleanup as expired — bare payment_intent.payment_failed events fire
 * when the customer's card declines mid-checkout. We don't always get a
 * matching session here (Stripe sends both), but cleanup is idempotent.
 */
export async function handlePaymentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  // Drop pending attendee reservations attached to this PI (the payment
  // cascades). Tips: mark failed rather than delete so the host can see
  // attempted tips.
  await repositories.eventPaymentRepo.deletePendingAttendeesByPaymentIntent(pi.id);
  await repositories.eventPaymentRepo.markPendingTipsFailedByPaymentIntent(pi.id);
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
  }

  // Team registrations (ADR 0007). The PI id was stored on the aggregate
  // at markPaid; refund flips it to Refunded which is the terminal state.
  await refundTeamRegistrationIfAny(piId, charge.amount_refunded ?? null);
  await refundRosterTeamPaymentIfAny(piId, charge.amount_refunded ?? null);
}
