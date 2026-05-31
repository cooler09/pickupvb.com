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
    // Pin the wire API version to the one this SDK bundles. Omitting it lets
    // each request fall back to the Stripe account's dashboard-default version,
    // so a `pnpm up stripe` (or a dashboard change) can silently move the
    // version our webhook payloads + API responses are parsed against. The
    // literal is type-checked against the SDK's `LatestApiVersion`, so a future
    // SDK bump fails typecheck here until it's updated deliberately and the
    // webhook payload shapes are re-verified.
    // See docs/audits/third-party-integrations.md TPI-4.
    apiVersion: '2026-04-22.dahlia',
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

/**
 * Stripe's standard US online card-present processing fee, in cents.
 *
 * Formula: 2.9% of the gross + 30¢, ceiling-rounded so the host is made
 * whole on the cent. This is the same fee Stripe charges on the connected
 * account when the charge settles — we re-bill it to the buyer as a
 * separate Checkout line item when the host opts into pass-through
 * (`events.pass_processing_fee_to_buyer`).
 *
 * Note: the fee is computed against the GROSS the buyer pays (ticket +
 * platform fee + processing fee). Strictly accurate gross-up would solve
 * a fixed-point equation; we use the simpler one-pass formula and accept
 * a sub-cent loss to the host on the recursion, matching every other
 * ticketing platform that does this pass-through.
 */
export function processingFeeCents(grossCents: number): number {
  if (grossCents <= 0) return 0;
  return Math.ceil(grossCents * 0.029) + 30;
}
