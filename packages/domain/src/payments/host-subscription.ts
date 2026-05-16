/**
 * Pro Host subscription — drives platform-fee tier, paid-event cap, and
 * billing-portal eligibility. Stored shape is plain so the domain doesn't
 * import the Stripe SDK; the infrastructure adapter translates from the
 * `host_subscriptions` row and the `is_pro_host` RPC.
 */
export type HostSubscriptionStatus =
    | 'incomplete'
    | 'incomplete_expired'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'paused';

export type HostSubscription = {
    hostId: string;
    status: HostSubscriptionStatus | string;
    plan: string | null;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
    cancelAtPeriodEnd: boolean;
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
};

/** Fields the webhook upsert mirrors from Stripe. */
export type HostSubscriptionUpsert = {
    hostId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    status: HostSubscriptionStatus | string;
    plan: string | null;
    currentPeriodEnd: string | null;
    trialEnd: string | null;
    cancelAtPeriodEnd: boolean;
};

/**
 * Repository contract (DDD port) for host subscription state and derived
 * quotas. `isPro` and `paidEventCount30d` are first-class methods because
 * both are driven by Postgres functions (`is_pro_host`,
 * `host_paid_event_count_30d`) rather than a simple row read.
 *
 * Writes:
 *   - `seedCustomer` — used pre-checkout to claim a Stripe customer id
 *     before the subscription exists. Ignores duplicate-key conflicts so
 *     it's safe to call on every checkout start.
 *   - `upsertFromStripe` — used by the `customer.subscription.*` webhook
 *     to mirror the full row keyed on `user_id`.
 *   - `findCustomerIdByHostId` — read-only helper for portal + checkout
 *     reuse without loading the full subscription.
 */
export interface HostSubscriptionRepository {
    findByHostId(hostId: string): Promise<HostSubscription | null>;
    isPro(hostId: string): Promise<boolean>;
    paidEventCount30d(hostId: string): Promise<number>;
    findCustomerIdByHostId(hostId: string): Promise<string | null>;
    findHostIdByCustomerId(customerId: string): Promise<string | null>;
    seedCustomer(hostId: string, stripeCustomerId: string): Promise<void>;
    upsertFromStripe(input: HostSubscriptionUpsert): Promise<void>;
}
