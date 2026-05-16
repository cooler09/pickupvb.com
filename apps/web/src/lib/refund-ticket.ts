import 'server-only';
import { getStripe, isStripeConfigured } from './stripe';
import { getAdminSupabase } from './supabase-admin';
import { assertWithinRefundWindow } from './refund-window';
import { log } from './log';

/**
 * Outcome of a refund attempt against an attendee row.
 *
 * - `refunded` — the Stripe refund call succeeded. The `charge.refunded`
 *   webhook will delete the attendee row + free capacity; the caller
 *   should bounce optimistically.
 * - `not_paid` — no paid row exists (or Stripe isn't configured). The
 *   caller should fall through to the normal `LeaveEventCommand` path.
 * - `window_closed` / `failed` — surface the reason to the user; do NOT
 *   delete the row, the buyer needs to contact the host.
 */
export type RefundOutcome =
    | { kind: 'refunded' }
    | { kind: 'not_paid' }
    | { kind: 'window_closed'; reason: string }
    | { kind: 'failed'; reason: string };

type AttRow = {
    payment_status: string;
    payment_intent_id: string | null;
    amount_paid_cents: number | null;
};

/**
 * Refund a paid attendee's ticket if eligible. Encapsulates the
 * lookup → refund-window check → Stripe call sequence used by
 * `leaveEvent`.
 *
 * On a successful Stripe refund we synchronously delete the attendee row
 * and write the audit entry so the UI reflects the cancellation on the
 * very next render. The `charge.refunded` webhook still fires later and
 * is idempotent (delete becomes a no-op).
 *
 * Returns a tagged outcome so the caller can map it to its own UX
 * (redirect flash, response body, etc.). Stripe failures are logged here
 * but the message is propagated for surfacing.
 */
export async function refundAttendeeTicket(
    eventId: string,
    userId: string,
): Promise<RefundOutcome> {
    const admin = getAdminSupabase();
    const { data: row } = await admin
        .from('event_attendees')
        .select('payment_status, payment_intent_id, amount_paid_cents')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .maybeSingle();
    const att = row as unknown as AttRow | null;

    if (!att || att.payment_status !== 'paid' || !att.payment_intent_id || !isStripeConfigured()) {
        return { kind: 'not_paid' };
    }

    const window = await assertWithinRefundWindow(eventId);
    if (!window.ok) {
        return { kind: 'window_closed', reason: window.reason };
    }

    let refundAmount: number | null = null;
    try {
        const stripe = getStripe();
        const refund = await stripe.refunds.create({
            payment_intent: att.payment_intent_id,
            reason: 'requested_by_customer',
            refund_application_fee: true,
            reverse_transfer: true,
        });
        refundAmount = refund.amount ?? null;
    } catch (err) {
        await log.error('[refund] failed', err, { eventId, userId });
        const reason = err instanceof Error ? err.message : 'Refund failed.';
        return { kind: 'failed', reason };
    }

    // Synchronously remove the attendee and audit-log the refund so the
    // page reflects the change on the next render. The charge.refunded
    // webhook runs later and is idempotent.
    const { error: delErr } = await admin
        .from('event_attendees')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId);
    if (delErr) {
        await log.error('[refund] delete attendee after refund failed', delErr, {
            eventId,
            userId,
        });
    }
    const { error: auditErr } = await admin.from('event_payment_audit').insert({
        event_id: eventId,
        user_id: userId,
        action: 'refunded',
        amount_cents: refundAmount ?? att.amount_paid_cents ?? 0,
        payment_intent_id: att.payment_intent_id,
    } as never);
    if (auditErr) {
        await log.error('[refund] audit insert failed', auditErr, { eventId, userId });
    }

    return { kind: 'refunded' };
}
