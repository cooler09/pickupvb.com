import 'server-only';
import { cache } from 'react';
import type { HostSubscriptionUpsert } from '@pickupvb/domain';
import { repositories } from './handlers';

/**
 * Pro Host subscription helpers. Thin facade over the
 * `HostSubscriptionRepository` port — kept in `apps/web/src/lib` so call
 * sites can `await isPro(userId)` without threading the repo through
 * everywhere. Subscriptions are a payments concern, not a volleyball-rules
 * concern, so they live in the `payments` subdomain.
 *
 * The DB function `is_pro_host(uuid)` is the source of truth for Pro
 * status; the adapter is a thin wrapper around it.
 */

export const PRO_MONTHLY_PRICE_USD = 10;
export const PRO_YEARLY_PRICE_USD = 100;
/** Platform fee for Pro hosts, in basis points (2.5%). */
export const PRO_PLATFORM_FEE_BPS = 250;
/** Free-tier cap on paid events per rolling 30 days. */
export const FREE_PAID_EVENT_CAP_30D = 1;

/**
 * Per-request memoized. Event detail (and several other pages) call this
 * from multiple side-load branches in the same render; `React.cache`
 * dedupes the underlying `is_pro_host(uuid)` lookup. See performance
 * audit P3 #12.
 */
export const isPro = cache(async (userId: string): Promise<boolean> => {
  return repositories.hostSubscriptionRepo.isPro(userId);
});

/** Count of paid events the user has created in the last 30 days. */
export async function hostPaidEventCount30d(userId: string): Promise<number> {
  return repositories.hostSubscriptionRepo.paidEventCount30d(userId);
}

/**
 * Snake-cased view of a host_subscriptions row. Preserved as the public
 * shape so page components (which spread it into JSX) don't need to
 * change; the facade maps from the camelCase port model.
 */
export type SubscriptionRow = {
  status: string;
  plan: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
};

export async function getHostSubscription(userId: string): Promise<SubscriptionRow | null> {
  const sub = await repositories.hostSubscriptionRepo.findByHostId(userId);
  if (!sub) return null;
  return {
    status: sub.status,
    plan: sub.plan,
    current_period_end: sub.currentPeriodEnd,
    trial_end: sub.trialEnd,
    cancel_at_period_end: sub.cancelAtPeriodEnd,
    stripe_customer_id: sub.stripeCustomerId,
    stripe_subscription_id: sub.stripeSubscriptionId,
  };
}

export async function getHostStripeCustomerId(userId: string): Promise<string | null> {
  return repositories.hostSubscriptionRepo.findCustomerIdByHostId(userId);
}

export async function findHostByStripeCustomerId(customerId: string): Promise<string | null> {
  return repositories.hostSubscriptionRepo.findHostIdByCustomerId(customerId);
}

export async function seedHostStripeCustomer(
  userId: string,
  stripeCustomerId: string,
): Promise<void> {
  await repositories.hostSubscriptionRepo.seedCustomer(userId, stripeCustomerId);
}

export async function upsertHostSubscriptionFromStripe(
  input: HostSubscriptionUpsert,
): Promise<void> {
  await repositories.hostSubscriptionRepo.upsertFromStripe(input);
}
