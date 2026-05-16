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
    /** Platform cut, in cents. May be 0 (e.g. tournament free pass). */
    applicationFeeAmount: number;
    /** Where Stripe sends the buyer on success / cancel. */
    successUrl: string;
    cancelUrl: string;
    /** Searchable on the resulting `payment_intent` + `checkout.session`. */
    metadata: Record<string, string>;
    /** Optional pre-fill for the email field on the Checkout page. */
    customerEmail?: string | null;
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
    return stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
        line_items: input.lineItems,
        payment_intent_data: {
            application_fee_amount: input.applicationFeeAmount,
            transfer_data: { destination: input.destinationAccountId },
        },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRES_SECS,
        metadata: input.metadata,
    });
}
