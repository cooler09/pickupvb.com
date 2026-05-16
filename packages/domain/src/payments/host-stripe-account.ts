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

/**
 * Repository contract (DDD port) for host Stripe Connect account state.
 * Adapter lives in @pickupvb/infrastructure.
 *
 * Read-only from the domain's perspective today — writes happen through
 * Stripe webhooks in the API layer. Add `upsert` here if/when a use case
 * needs to mutate it through application services.
 */
export interface HostStripeAccountRepository {
    findByHostId(hostId: string): Promise<HostStripeAccount | null>;
}
