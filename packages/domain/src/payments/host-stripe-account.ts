/**
 * Host Stripe Connect account — the per-host payouts destination used to
 * route ticket and tip revenue. Stored shape is intentionally plain so the
 * domain doesn't depend on the Stripe SDK; the infrastructure adapter
 * translates between Stripe-shaped rows and this read model.
 */
export type HostStripeAccount = {
    hostId: string;
    accountId: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
};

/** Mutable subset of the account state mirrored from Stripe. */
export type HostStripeAccountStatus = {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
};

/**
 * Repository contract (DDD port) for host Stripe Connect account state.
 * Adapter lives in @pickupvb/infrastructure.
 *
 * Writes are split by the natural key the caller has on hand:
 *   - `create` for new onboarding rows (we know hostId + accountId).
 *   - `updateStatusByHostId` for our own refresh-from-Stripe action.
 *   - `updateStatusByAccountId` for the `account.updated` webhook, which
 *     receives a Stripe account id but not our user id. Returns `false`
 *     when no row matches (host hasn't onboarded yet) so the webhook can
 *     no-op gracefully.
 */
export interface HostStripeAccountRepository {
    findByHostId(hostId: string): Promise<HostStripeAccount | null>;
    create(account: HostStripeAccount): Promise<void>;
    updateStatusByHostId(
        hostId: string,
        status: HostStripeAccountStatus,
    ): Promise<void>;
    updateStatusByAccountId(
        accountId: string,
        status: HostStripeAccountStatus,
        lastEventPayload?: Record<string, unknown>,
    ): Promise<boolean>;
}
