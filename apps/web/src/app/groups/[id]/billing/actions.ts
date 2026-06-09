'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Route } from 'next';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { getServerSupabase } from '@/lib/supabase';
import { requireRealUser } from '@/lib/server-auth';
import { buildOrigin } from '@/lib/server-redirects';
import { log } from '@/lib/log';
import {
  CLUB_MONTHLY_PRICE_CENTS,
  isClubGroup,
  getGroupStripeCustomerId,
  seedGroupStripeCustomer,
} from '@/lib/club';
import {
  createGroupStripeAccount,
  getGroupStripeAccountStatus,
  updateGroupStripeAccountStatusByGroup,
} from '@/lib/group-stripe-account';

/**
 * Group "Club" billing actions (ADR 0038): subscribe the group to Club (Stripe
 * Billing on the platform account), and onboard the group's own Stripe Connect
 * payout account. Gated to the group's owner/admin. Connecting a payout account
 * requires an active Club subscription (the perk it unlocks).
 *
 * The route segment `[id]` is the group SLUG (like the rest of /groups/[id]); we
 * resolve it to the group UUID for DB ops and redirect back using the slug.
 */

function flash(slug: string, code: string): never {
  redirect(`/groups/${slug}/billing?club=${code}` as Route);
}

/**
 * Resolve the slug → group UUID + gate the viewer to owner/admin. Redirects to
 * the group page if the viewer isn't a manager (or the group is missing).
 */
async function requireGroupManager(
  slug: string,
): Promise<{ groupId: string; email: string | null }> {
  const { user } = await requireRealUser(`/groups/${slug}/billing`);
  const sb = await getServerSupabase();
  const { data: groupRow } = await sb.from('groups').select('id').eq('slug', slug).maybeSingle();
  const groupId = (groupRow as { id: string } | null)?.id;
  if (!groupId) redirect(`/groups/${slug}` as Route);
  const { data: roleRow } = await sb
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle();
  const role = (roleRow as { role: string } | null)?.role;
  if (role !== 'owner' && role !== 'admin') redirect(`/groups/${slug}` as Route);
  return { groupId, email: user.email ?? null };
}

async function getOrCreateClubCustomerId(groupId: string, email: string | null): Promise<string> {
  const existing = await getGroupStripeCustomerId(groupId);
  if (existing) return existing;
  const customer = await getStripe().customers.create({
    ...(email ? { email } : {}),
    metadata: { group_id: groupId, kind: 'club' },
  });
  await seedGroupStripeCustomer(groupId, customer.id);
  return customer.id;
}

export async function startClubCheckout(slug: string): Promise<void> {
  if (!isStripeConfigured()) flash(slug, 'payments_off');
  const { groupId, email } = await requireGroupManager(slug);

  const customerId = await getOrCreateClubCustomerId(groupId, email);
  const origin = await buildOrigin();

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: CLUB_MONTHLY_PRICE_CENTS,
          recurring: { interval: 'month' },
          product_data: { name: 'PickupVB Club' },
        },
      },
    ],
    subscription_data: { metadata: { kind: 'club', group_id: groupId } },
    payment_method_collection: 'always',
    allow_promotion_codes: true,
    success_url: `${origin}/groups/${slug}/billing?club=subscribed`,
    cancel_url: `${origin}/groups/${slug}/billing?club=cancel`,
    metadata: { kind: 'club', group_id: groupId },
  });

  if (!session.url) flash(slug, 'error');
  redirect(session.url as Route);
}

export async function getClubBillingPortalUrl(slug: string): Promise<string | null> {
  if (!isStripeConfigured()) return null;
  const { groupId } = await requireGroupManager(slug);
  const customerId = await getGroupStripeCustomerId(groupId);
  if (!customerId) return null;
  const origin = await buildOrigin();
  const portal = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/groups/${slug}/billing`,
  });
  return portal.url;
}

export async function startGroupStripeOnboarding(slug: string): Promise<void> {
  if (!isStripeConfigured()) flash(slug, 'payments_off');
  const { groupId } = await requireGroupManager(slug);

  // Connecting a payout account is the Club perk — require an active Club sub.
  if (!(await isClubGroup(groupId))) flash(slug, 'needs_club');

  const stripe = getStripe();
  const existing = await getGroupStripeAccountStatus(groupId);
  let accountId = existing?.accountId ?? null;

  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        // owner_type lets the account.updated webhook mirror into
        // group_stripe_accounts instead of host_stripe_accounts.
        metadata: { owner_type: 'group', group_id: groupId },
      });
      accountId = account.id;
      await createGroupStripeAccount(groupId, accountId);
    } catch (err) {
      await log.error('[club-onboarding] create account failed', err, { groupId });
      flash(slug, 'error');
    }
  }

  const origin = await buildOrigin();
  const link = await stripe.accountLinks.create({
    account: accountId!,
    return_url: `${origin}/groups/${slug}/billing?onboarding=complete`,
    refresh_url: `${origin}/groups/${slug}/billing?onboarding=refresh`,
    type: 'account_onboarding',
  });
  redirect(link.url as Route);
}

export async function refreshGroupStripeAccountStatus(slug: string): Promise<void> {
  if (!isStripeConfigured()) return;
  const { groupId } = await requireGroupManager(slug);
  const existing = await getGroupStripeAccountStatus(groupId);
  if (!existing) return;
  try {
    const account = await getStripe().accounts.retrieve(existing.accountId);
    await updateGroupStripeAccountStatusByGroup(groupId, {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
    revalidatePath(`/groups/${slug}/billing` as Route);
  } catch (err) {
    await log.error('[club-onboarding] refresh status failed', err, { groupId });
  }
}

export async function getGroupStripeDashboardUrl(slug: string): Promise<string | null> {
  if (!isStripeConfigured()) return null;
  const { groupId } = await requireGroupManager(slug);
  const existing = await getGroupStripeAccountStatus(groupId);
  if (!existing) return null;
  const link = await getStripe().accounts.createLoginLink(existing.accountId);
  return link.url;
}
