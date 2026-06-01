import 'server-only';
import type Stripe from 'stripe';
import { getStripe } from './stripe';

/**
 * Default expiry for a hosted Checkout Session. Stripe accepts a range of
 * 30 min to 24 h; 30 min matches both ticket and tip flows and is enough
 * for a buyer to come back from email but short enough to free the
 * reserved spot quickly if they bail.
 */
export const CHECKOUT_EXPIRES_SECS = 30 * 60;

export type DestinationCheckoutSessionInput = {
  /** Stripe Connect account that should receive the funds. */
  destinationAccountId: string;
  /** Pre-built line items — shape varies per kind (ticket vs tip). */
  lineItems: NonNullable<Stripe.Checkout.SessionCreateParams['line_items']>;
  /**
   * Platform cut, in cents. May be 0 — tips take no platform fee (ADR 0014
   * tip-fee amendment) and some flows (e.g. a free pass) have none either. When
   * 0, `application_fee_amount` is omitted entirely rather than sent as `0`, so
   * the destination charge transfers the full amount to the host.
   */
  applicationFeeAmount: number;
  /** Where Stripe sends the buyer on success / cancel. */
  successUrl: string;
  cancelUrl: string;
  /** Searchable on the resulting `payment_intent` + `checkout.session`. */
  metadata: Record<string, string>;
  /** Optional pre-fill for the email field on the Checkout page. */
  customerEmail?: string | null;
  /**
   * Optional Stripe idempotency key. Pass a value derived from the pending
   * payment row (e.g. `tip:<tipId>`) so a retried `sessions.create` — a
   * network blip, the SDK's own `maxNetworkRetries`, or a re-run of the same
   * server action — maps to at most ONE Checkout Session instead of creating
   * a duplicate. Stripe dedupes on this key for 24h. Keep the key tied to the
   * pending row, not to stable inputs, so legitimate repeat purchases (a new
   * row each time) still create distinct sessions.
   * See docs/audits/third-party-integrations.md TPI-5.
   */
  idempotencyKey?: string;
};

/**
 * Create a Stripe Checkout Session that routes the charge to a Connect
 * account via `transfer_data.destination`, taking a platform cut as
 * `application_fee_amount`.
 *
 * Centralized so the two destination-charge flows (event ticket + tip
 * jar) share the same defaults: card-only, 30-minute expiry, USD,
 * Connect destination, metadata propagated to the payment intent.
 */
export async function createDestinationCheckoutSession(
  input: DestinationCheckoutSessionInput,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.create(
    {
      mode: 'payment',
      payment_method_types: ['card'],
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      line_items: input.lineItems,
      payment_intent_data: {
        // Omit (don't send 0) when there's no platform cut — e.g. tips, which
        // take no platform fee. A 0 application fee with transfer_data would
        // route the full charge to the host anyway; omitting is cleaner and
        // dodges any Stripe edge-case validation on a zero fee.
        ...(input.applicationFeeAmount > 0
          ? { application_fee_amount: input.applicationFeeAmount }
          : {}),
        transfer_data: { destination: input.destinationAccountId },
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRES_SECS,
      metadata: input.metadata,
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  );
}
