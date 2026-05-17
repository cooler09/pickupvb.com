'use server';

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/supabase';
import { getHostStripeCustomerId, seedHostStripeCustomer } from '@/lib/pro';
import { buildOrigin } from '@/lib/server-redirects';
import { log } from '@/lib/log';

/**
 * Pro Host subscription actions. Uses Stripe Billing (NOT Stripe Connect —
 * Connect is for paying hosts; Billing is for charging hosts).
 *
 * Flow:
 *   1. `startProCheckout(plan)` — create-or-reuse a Stripe customer for the
 *      user, then redirect to a Stripe Checkout session for the chosen price.
 *      Stripe handles the trial automatically via the price's trial_period_days.
 *   2. `openBillingPortal()` — one-click portal for existing subscribers to
 *      cancel / update payment method / switch plans.
 *
 * The webhook (`customer.subscription.*` / `invoice.*`) keeps the
 * `host_subscriptions` table in sync.
 */

function priceIdFor(plan: 'monthly' | 'yearly'): string | null {
    const id =
        plan === 'monthly'
            ? process.env['STRIPE_PRO_MONTHLY_PRICE_ID']
            : process.env['STRIPE_PRO_YEARLY_PRICE_ID'];
    return id ?? null;
}

async function getOrCreateCustomerId(
    userId: string,
    email: string | null,
): Promise<string> {
    const stripe = getStripe();
    const existingId = await getHostStripeCustomerId(userId);
    if (existingId) return existingId;

    const customer = await stripe.customers.create({
        ...(email ? { email } : {}),
        metadata: { user_id: userId },
    });
    // Pre-seed the row with status='incomplete' so the webhook upsert path
    // is simpler; it'll get overwritten on subscription.created.
    try {
        await seedHostStripeCustomer(userId, customer.id);
    } catch (error) {
        await log.error('[pro] seed host_subscriptions failed', error);
    }
    return customer.id;
}

export async function startProCheckout(plan: 'monthly' | 'yearly'): Promise<void> {
    if (!isStripeConfigured()) {
        throw new Error('Stripe is not configured on the server.');
    }
    const priceId = priceIdFor(plan);
    if (!priceId) {
        throw new Error(
            `Missing STRIPE_PRO_${plan.toUpperCase()}_PRICE_ID env var. ` +
            `Create the price in Stripe Dashboard and set the id.`,
        );
    }

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/profile/billing/pro');
    if (user.is_anonymous) {
        redirect('/profile/billing/pro?error=anonymous' as Route);
    }

    const customerId = await getOrCreateCustomerId(user.id, user.email ?? null);

    const origin = await buildOrigin();

    const session = await getStripe().checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
            trial_period_days: 14,
            metadata: { user_id: user.id },
        },
        // Lets Stripe attach the payment method back to the customer for the
        // trial without charging; we still capture once the trial ends.
        payment_method_collection: 'always',
        allow_promotion_codes: true,
        success_url: `${origin}/profile/billing/pro?status=success`,
        cancel_url: `${origin}/profile/billing/pro?status=cancel`,
        metadata: { user_id: user.id, plan },
    });

    if (!session.url) {
        throw new Error('Stripe did not return a checkout URL.');
    }
    redirect(session.url as Route);
}

export async function openBillingPortal(): Promise<void> {
    if (!isStripeConfigured()) {
        throw new Error('Stripe is not configured on the server.');
    }

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/profile/billing/pro');

    const customerId = await getHostStripeCustomerId(user.id);
    if (!customerId) {
        redirect('/profile/billing/pro?error=no_customer' as Route);
    }

    const origin = await buildOrigin();

    const portal = await getStripe().billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/profile/billing/pro`,
    });

    redirect(portal.url as Route);
}

/**
 * Same as {@link openBillingPortal} but returns the URL instead of
 * redirecting. Lets a client component open the portal in a new tab
 * (Server Actions can't honor `target="_blank"`).
 */
export async function getBillingPortalUrl(): Promise<string> {
    if (!isStripeConfigured()) {
        throw new Error('Stripe is not configured on the server.');
    }

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in.');

    const customerId = await getHostStripeCustomerId(user.id);
    if (!customerId) throw new Error('No Stripe customer for this account.');

    const origin = await buildOrigin();

    const portal = await getStripe().billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/profile/billing/pro`,
    });

    return portal.url;
}
