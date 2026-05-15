import 'server-only';
import Stripe from 'stripe';

/**
 * Server-only Stripe SDK client. Lazy-initialized so importing this module
 * doesn't crash when STRIPE_SECRET_KEY is unset (local dev without Stripe
 * configured). Call `getStripe()` from places that actually need it; it will
 * throw a clear error if the key is missing.
 *
 * Use the `isStripeConfigured()` guard to render conditional UI / 503 a
 * webhook cleanly without forcing dev environments to set keys.
 */
let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
    return Boolean(process.env['STRIPE_SECRET_KEY']);
}

export function getStripe(): Stripe {
    if (cached) return cached;
    const key = process.env['STRIPE_SECRET_KEY'];
    if (!key) {
        throw new Error(
            'STRIPE_SECRET_KEY is not set. Set it in apps/web/.env.local (or .env) to enable payments.',
        );
    }
    cached = new Stripe(key, {
        // Let the SDK pick its bundled API version. We get type safety for
        // that exact version by doing nothing here.
        typescript: true,
        // Vercel functions are short-lived; we don't need pooling.
        maxNetworkRetries: 2,
    });
    return cached;
}

/**
 * The platform's cut on each ticket sale, expressed in basis points so the
 * math stays in integers. 500 = 5%. Stripe's own processing fee (~2.9% + 30¢)
 * is ON TOP of this and is paid by the connected account.
 */
export const PLATFORM_FEE_BPS = 500;

/** Compute the application_fee_amount in cents from a ticket price in cents. */
export function platformFeeCents(amountCents: number): number {
    return Math.round((amountCents * PLATFORM_FEE_BPS) / 10_000);
}
