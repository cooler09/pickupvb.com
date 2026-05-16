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

/**
 * Repository contract (DDD port) for host subscription state and derived
 * quotas. `isPro` and `paidEventCount30d` are first-class methods because
 * both are driven by Postgres functions (`is_pro_host`,
 * `host_paid_event_count_30d`) rather than a simple row read.
 */
export interface HostSubscriptionRepository {
    findByHostId(hostId: string): Promise<HostSubscription | null>;
    isPro(hostId: string): Promise<boolean>;
    paidEventCount30d(hostId: string): Promise<number>;
}
