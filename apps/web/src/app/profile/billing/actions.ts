'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import type { Route } from 'next';
import { InvariantViolation, UnauthorizedError } from '@pickupvb/domain';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/supabase';
import {
  createHostStripeAccount,
  getHostStripeAccountStatus,
  updateHostStripeAccountStatus,
} from '@/lib/host-stripe-account';
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
    throw new InvariantViolation('Stripe is not configured on the server.');
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

  const stripe = getStripe();

  // 1. Find or create the connected account.
  const existing = await getHostStripeAccountStatus(user.id);
  let accountId = existing?.accountId ?? null;

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

    try {
      await createHostStripeAccount({
        hostId: user.id,
        accountId,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      });
    } catch (insertErr) {
      await log.error('[stripe-onboarding] insert account row failed', insertErr);
      throw new InvariantViolation('Failed to record Stripe account.');
    }
  }

  // 2. Build absolute return / refresh URLs.
  const h = await headers();
  const origin =
    h.get('origin') ?? (h.get('host') ? `https://${h.get('host')}` : 'http://localhost:3000');
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
    throw new InvariantViolation('Stripe is not configured on the server.');
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/profile/billing');

  const existing = await getHostStripeAccountStatus(user.id);
  const accountId = existing?.accountId;
  if (!accountId) redirect('/profile/billing' as Route);

  const link = await getStripe().accounts.createLoginLink(accountId);
  redirect(link.url as Route);
}

/**
 * Same as {@link openStripeDashboard} but returns the URL instead of
 * redirecting. Lets a client component open the dashboard in a new tab
 * (Server Actions can't honor `target="_blank"`).
 *
 * Returns `null` when the user has no Stripe account yet — the caller
 * should show "finish onboarding" UI instead.
 */
export async function getStripeDashboardUrl(): Promise<string | null> {
  if (!isStripeConfigured()) {
    throw new InvariantViolation('Stripe is not configured on the server.');
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError('Not signed in.');

  const existing = await getHostStripeAccountStatus(user.id);
  const accountId = existing?.accountId;
  if (!accountId) return null;

  const link = await getStripe().accounts.createLoginLink(accountId);
  return link.url;
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

  const existing = await getHostStripeAccountStatus(user.id);
  const accountId = existing?.accountId;
  if (!accountId) return;

  try {
    const account = await getStripe().accounts.retrieve(accountId);
    await updateHostStripeAccountStatus(user.id, {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
    revalidatePath('/profile/billing');
  } catch (err) {
    await log.error('[stripe-onboarding] refresh status failed', err);
  }
}
