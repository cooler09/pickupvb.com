/**
 * Why a paid attendee's in-app self-cancel can't issue an online refund.
 * The "Cancel sign-up & refund" affordance only works when there's an
 * online charge to reverse, the host's Connect account can still receive
 * the reversal, and we're inside the refund window. When any of these
 * fail we still let the attendee self-cancel, but the button drops the
 * "& refund" promise and warns no money is returned (see
 * `PaidTicketPanel`).
 *
 * - `off_platform`  — no online charge (host marked them paid in person);
 *   nothing exists to refund through Stripe.
 * - `host_not_ready` — host has no charges/refunds-enabled Connect
 *   account, so the reversal would fail.
 * - `window_closed` — past `starts_at − refund_window_hours`.
 */
export type RefundBlockReason = 'off_platform' | 'host_not_ready' | 'window_closed';

/**
 * Render-time mirror of the runtime refund gate (`refundAttendeeTicket` →
 * `assertWithinRefundWindow`). Returns the reason an online refund is
 * impossible, or `null` when the attendee is fully refundable. Only paid
 * attendees can be blocked — everyone else returns `null`.
 *
 * Keep the window math identical to `assertWithinRefundWindow`
 * (`cutoff = startsAt − windowMs`, blocked when `now > cutoff`) so the UI
 * never offers a refund the server would then refuse.
 */
export function refundBlockReason(args: {
  paymentStatus: 'paid' | 'pending' | 'none' | undefined;
  /** True when the paid row has a Stripe `payment_intent_id`. */
  viaStripe: boolean;
  hostStripeReady: boolean;
  startsAtMs: number;
  refundWindowHours: number;
  nowMs: number;
}): RefundBlockReason | null {
  if (args.paymentStatus !== 'paid') return null;
  if (!args.viaStripe) return 'off_platform';
  if (!args.hostStripeReady) return 'host_not_ready';
  const cutoff = args.startsAtMs - args.refundWindowHours * 60 * 60 * 1000;
  if (args.nowMs > cutoff) return 'window_closed';
  return null;
}
