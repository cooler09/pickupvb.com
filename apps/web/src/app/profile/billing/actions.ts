'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import type { Route } from 'next';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { getServerSupabase } from '@/lib/supabase';
import { log } from '@/lib/log';

/**
 * Look up (or create) a Stripe Connect Express account for the current user
 * and redirect them to Stripe's hosted onboarding flow.
 *
 * Idempotent: if the user already has a `host_stripe_accounts` row we reuse
 * the existing `stripe_account_id` and just generate a fresh account link
 * (these expire after a few minutes).
 */
export async function startStripeOnboarding(): Promise<void> {
    if (!isStripeConfigured()) {
        throw new Error('Stripe is not configured on the server.');
    }

    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/profile/billing');
    // Anonymous users can't be paid out. The UI should hide the entry point,
    // but guard anyway.
    if (user.is_anonymous) {
        redirect('/profile/billing?error=anonymous' as Route);
    }

    const admin = getAdminSupabase();
    const stripe = getStripe();

    // 1. Find or create the connected account.
    type Row = { stripe_account_id: string };
    const { data: existing } = await admin
        .from('host_stripe_accounts')
        .select('stripe_account_id')
        .eq('user_id', user.id)
        .maybeSingle();

    let accountId = (existing as Row | null)?.stripe_account_id ?? null;

    if (!accountId) {
        const account = await stripe.accounts.create({
            type: 'express',
            country: 'US',
            ...(user.email ? { email: user.email } : {}),
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
            business_type: 'individual',
            metadata: { user_id: user.id },
        });
        accountId = account.id;

        const { error: insertErr } = await admin
            .from('host_stripe_accounts')
            .insert({
                user_id: user.id,
                stripe_account_id: accountId,
                charges_enabled: account.charges_enabled,
                payouts_enabled: account.payouts_enabled,
                details_submitted: account.details_submitted,
            } as never);
        if (insertErr) {
            await log.error('[stripe-onboarding] insert account row failed', insertErr);
            throw new Error('Failed to record Stripe account.');
        }
    }

    // 2. Build absolute return / refresh URLs.
    const h = await headers();
    const origin =
        h.get('origin') ??
        (h.get('host') ? `https://${h.get('host')}` : 'http://localhost:3000');
    const returnUrl = `${origin}/profile/billing?onboarding=complete`;
    const refreshUrl = `${origin}/profile/billing?onboarding=refresh`;

    // 3. Create a fresh account link and redirect.
    const link = await stripe.accountLinks.create({
        account: accountId,
        return_url: returnUrl,
        refresh_url: refreshUrl,
        type: 'account_onboarding',
    });

    redirect(link.url as Route);
}

/**
 * Open the host's Stripe Express Dashboard (where they can see payouts,
 * update bank info, etc.). Uses a one-time login link.
 */
export async function openStripeDashboard(): Promise<void> {
    if (!isStripeConfigured()) {
        throw new Error('Stripe is not configured on the server.');
    }

    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login?next=/profile/billing');

    const admin = getAdminSupabase();
    type Row = { stripe_account_id: string };
    const { data: row } = await admin
        .from('host_stripe_accounts')
        .select('stripe_account_id')
        .eq('user_id', user.id)
        .maybeSingle();

    const accountId = (row as Row | null)?.stripe_account_id;
    if (!accountId) redirect('/profile/billing' as Route);

    const link = await getStripe().accounts.createLoginLink(accountId);
    redirect(link.url as Route);
}

/**
 * Pull the latest account state from Stripe and write it into our table.
 * Useful after the user returns from onboarding — the `account.updated`
 * webhook may not have fired yet, so the page would show stale "incomplete"
 * status. Called from the billing page itself.
 */
export async function refreshStripeAccountStatus(): Promise<void> {
    if (!isStripeConfigured()) return;

    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const admin = getAdminSupabase();
    type Row = { stripe_account_id: string };
    const { data: row } = await admin
        .from('host_stripe_accounts')
        .select('stripe_account_id')
        .eq('user_id', user.id)
        .maybeSingle();

    const accountId = (row as Row | null)?.stripe_account_id;
    if (!accountId) return;

    try {
        const account = await getStripe().accounts.retrieve(accountId);
        await admin
            .from('host_stripe_accounts')
            .update({
                charges_enabled: account.charges_enabled,
                payouts_enabled: account.payouts_enabled,
                details_submitted: account.details_submitted,
            } as never)
            .eq('user_id', user.id);
        revalidatePath('/profile/billing');
    } catch (err) {
        await log.error('[stripe-onboarding] refresh status failed', err);
    }
}
