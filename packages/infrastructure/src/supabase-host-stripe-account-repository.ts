import {
    type HostStripeAccount,
    type HostStripeAccountRepository,
    type HostStripeAccountStatus,
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
 * Write paths cover onboarding (insert), self-refresh (by hostId), and the
 * `account.updated` webhook (by Stripe account id).
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

    async create(account: HostStripeAccount): Promise<void> {
        const { error } = await this.client
            .from('host_stripe_accounts')
            .insert({
                user_id: account.hostId,
                stripe_account_id: account.accountId,
                charges_enabled: account.chargesEnabled,
                payouts_enabled: account.payoutsEnabled,
                details_submitted: account.detailsSubmitted,
            } as never);
        if (error) {
            throw new Error(
                `HostStripeAccount.create(${account.hostId}) failed: ${error.message}`,
            );
        }
    }

    async updateStatusByHostId(
        hostId: string,
        status: HostStripeAccountStatus,
    ): Promise<void> {
        const { error } = await this.client
            .from('host_stripe_accounts')
            .update({
                charges_enabled: status.chargesEnabled,
                payouts_enabled: status.payoutsEnabled,
                details_submitted: status.detailsSubmitted,
            } as never)
            .eq('user_id', hostId);
        if (error) {
            throw new Error(
                `HostStripeAccount.updateStatusByHostId(${hostId}) failed: ${error.message}`,
            );
        }
    }

    async updateStatusByAccountId(
        accountId: string,
        status: HostStripeAccountStatus,
        lastEventPayload?: Record<string, unknown>,
    ): Promise<boolean> {
        const patch: Record<string, unknown> = {
            charges_enabled: status.chargesEnabled,
            payouts_enabled: status.payoutsEnabled,
            details_submitted: status.detailsSubmitted,
        };
        if (lastEventPayload) patch['last_event_payload'] = lastEventPayload;
        const { error, count } = await this.client
            .from('host_stripe_accounts')
            .update(patch as never, { count: 'exact' })
            .eq('stripe_account_id', accountId);
        if (error) {
            // PGRST116 = no rows matched. Treat as a no-op so the webhook
            // doesn't 500 when the host hasn't onboarded through our flow.
            if (error.code === 'PGRST116') return false;
            throw new Error(
                `HostStripeAccount.updateStatusByAccountId(${accountId}) failed: ${error.message}`,
            );
        }
        return (count ?? 0) > 0;
    }
}
