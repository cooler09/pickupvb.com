'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { Route } from 'next';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/supabase';
import { getAdminSupabase } from '@/lib/supabase-admin';
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
    const admin = getAdminSupabase();
    const stripe = getStripe();
    type Row = { stripe_customer_id: string };
    const { data: existing } = await admin
        .from('host_subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .maybeSingle();
    const existingId = (existing as Row | null)?.stripe_customer_id;
    if (existingId) return existingId;

    const customer = await stripe.customers.create({
        ...(email ? { email } : {}),
        metadata: { user_id: userId },
    });
    // Pre-seed the row with status='incomplete' so the webhook upsert path
    // is simpler; it'll get overwritten on subscription.created.
    const { error } = await admin
        .from('host_subscriptions')
        .insert({
            user_id: userId,
            stripe_customer_id: customer.id,
            status: 'incomplete',
        } as never);
    if (error && error.code !== '23505') {
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

    const h = await headers();
    const origin =
        h.get('origin') ??
        (h.get('host') ? `https://${h.get('host')}` : 'http://localhost:3000');

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

    const admin = getAdminSupabase();
    type Row = { stripe_customer_id: string };
    const { data } = await admin
        .from('host_subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle();
    const customerId = (data as Row | null)?.stripe_customer_id;
    if (!customerId) {
        redirect('/profile/billing/pro?error=no_customer' as Route);
    }

    const h = await headers();
    const origin =
        h.get('origin') ??
        (h.get('host') ? `https://${h.get('host')}` : 'http://localhost:3000');

    const portal = await getStripe().billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/profile/billing/pro`,
    });

    redirect(portal.url as Route);
}
