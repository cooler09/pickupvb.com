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

type AttRow = { payment_status: string; payment_intent_id: string | null };

/**
 * Refund a paid attendee's ticket if eligible. Encapsulates the
 * lookup → refund-window check → Stripe call sequence used by
 * `leaveEvent`. The webhook handles audit + row removal on success.
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
        .select('payment_status, payment_intent_id')
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

    try {
        const stripe = getStripe();
        await stripe.refunds.create({
            payment_intent: att.payment_intent_id,
            reason: 'requested_by_customer',
            refund_application_fee: true,
            reverse_transfer: true,
        });
        return { kind: 'refunded' };
    } catch (err) {
        await log.error('[refund] failed', err, { eventId, userId });
        const reason = err instanceof Error ? err.message : 'Refund failed.';
        return { kind: 'failed', reason };
    }
}
