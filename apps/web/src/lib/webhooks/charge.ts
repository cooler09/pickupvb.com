/**
 * `charge.refunded` + `payment_intent.payment_failed` webhook handlers
 * (architecture audit P3-2 — extracted verbatim from the webhook route).
 * Refunds flip the row refunded + delete it so capacity re-opens; failures
 * drop pending reservations. Both are idempotent.
 */
import type Stripe from 'stripe';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { notify } from '@/lib/notify';
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
export async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
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
