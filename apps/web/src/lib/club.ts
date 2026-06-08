import 'server-only';
import { cache } from 'react';
import { getAdminSupabase } from './supabase-admin';

/**
 * Club tier (ADR 0038): a group's paid subscription, the gate for the group
 * payout account. Facade over `group_subscriptions` + the `is_club_group` RPC,
 * via the admin client (writes are admin-only; the gate is read for managers).
 * Mirrors `pro.ts` for the per-user Pro subscription.
 */

/** Club price (monthly), in cents. Inline price_data — no Stripe Price object. */
export const CLUB_MONTHLY_PRICE_CENTS = 2500;

/** Per-request memoized Club status check (the `is_club_group` RPC). */
export const isClubGroup = cache(async (groupId: string): Promise<boolean> => {
  const { data } = await getAdminSupabase().rpc('is_club_group', { p_group_id: groupId });
  return data === true;
});

export type GroupSubscriptionRow = {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
};

export async function getGroupSubscription(groupId: string): Promise<GroupSubscriptionRow | null> {
  const { data } = await getAdminSupabase()
    .from('group_subscriptions')
    .select(
      'status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id',
    )
    .eq('group_id', groupId)
    .maybeSingle();
  return (data as GroupSubscriptionRow | null) ?? null;
}

export async function getGroupStripeCustomerId(groupId: string): Promise<string | null> {
  const { data } = await getAdminSupabase()
    .from('group_subscriptions')
    .select('stripe_customer_id')
    .eq('group_id', groupId)
    .maybeSingle();
  return (data as { stripe_customer_id: string } | null)?.stripe_customer_id ?? null;
}

/** Pre-seed the row at checkout so the webhook upsert path is simple. */
export async function seedGroupStripeCustomer(groupId: string, customerId: string): Promise<void> {
  await getAdminSupabase()
    .from('group_subscriptions')
    .upsert(
      { group_id: groupId, stripe_customer_id: customerId, status: 'incomplete' },
      { onConflict: 'group_id' },
    );
}

export async function upsertGroupSubscriptionFromStripe(input: {
  groupId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
}): Promise<void> {
  await getAdminSupabase().from('group_subscriptions').upsert(
    {
      group_id: input.groupId,
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscriptionId,
      status: input.status,
      current_period_end: input.currentPeriodEnd,
      trial_end: input.trialEnd,
      cancel_at_period_end: input.cancelAtPeriodEnd,
    },
    { onConflict: 'group_id' },
  );
}
