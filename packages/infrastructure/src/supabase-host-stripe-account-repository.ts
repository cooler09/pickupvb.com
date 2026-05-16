import {
    type HostStripeAccount,
    type HostStripeAccountRepository,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type Row = {
    stripe_account_id: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
};

/**
 * Adapter for `HostStripeAccountRepository`. Reads from
 * `host_stripe_accounts` — a service-role-only table (no RLS policies), so
 * the admin client is required even from server actions.
 *
 * Writes happen exclusively in the Stripe webhook handler today; if a
 * future use case needs to upsert through the application layer, add an
 * `upsert` method to the port and implement it here.
 */
export class SupabaseHostStripeAccountRepository implements HostStripeAccountRepository {
    private _client: SupabaseClient | null = null;

    private get client(): SupabaseClient {
        if (!this._client) this._client = createSupabaseAdminClient();
        return this._client;
    }

    async findByHostId(hostId: string): Promise<HostStripeAccount | null> {
        const { data, error } = await this.client
            .from('host_stripe_accounts')
            .select(
                'stripe_account_id, charges_enabled, payouts_enabled, details_submitted',
            )
            .eq('user_id', hostId)
            .maybeSingle();
        if (error) {
            throw new Error(
                `HostStripeAccount.findByHostId(${hostId}) failed: ${error.message}`,
            );
        }
        const row = data as unknown as Row | null;
        if (!row) return null;
        return {
            hostId,
            accountId: row.stripe_account_id,
            chargesEnabled: row.charges_enabled,
            payoutsEnabled: row.payouts_enabled,
            detailsSubmitted: row.details_submitted,
        };
    }
}
