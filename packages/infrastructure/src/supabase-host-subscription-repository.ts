import {
    type HostSubscription,
    type HostSubscriptionRepository,
} from '@pickupvb/domain';
import { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type Row = {
    status: string;
    plan: string | null;
    current_period_end: string | null;
    trial_end: string | null;
    cancel_at_period_end: boolean;
    stripe_customer_id: string;
    stripe_subscription_id: string | null;
};

/**
 * Adapter for `HostSubscriptionRepository`. Reads from `host_subscriptions`
 * (service-role only) and calls the Postgres functions `is_pro_host` and
 * `host_paid_event_count_30d` for derived quotas — those are the source of
 * truth so the platform fee and free-tier cap agree across SQL and TS.
 */
export class SupabaseHostSubscriptionRepository implements HostSubscriptionRepository {
    private _client: SupabaseClient | null = null;

    private get client(): SupabaseClient {
        if (!this._client) this._client = createSupabaseAdminClient();
        return this._client;
    }

    async findByHostId(hostId: string): Promise<HostSubscription | null> {
        const { data, error } = await this.client
            .from('host_subscriptions')
            .select(
                'status, plan, current_period_end, trial_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id',
            )
            .eq('user_id', hostId)
            .maybeSingle();
        if (error) {
            throw new Error(
                `HostSubscription.findByHostId(${hostId}) failed: ${error.message}`,
            );
        }
        const row = data as unknown as Row | null;
        if (!row) return null;
        return {
            hostId,
            status: row.status,
            plan: row.plan,
            currentPeriodEnd: row.current_period_end,
            trialEnd: row.trial_end,
            cancelAtPeriodEnd: row.cancel_at_period_end,
            stripeCustomerId: row.stripe_customer_id,
            stripeSubscriptionId: row.stripe_subscription_id,
        };
    }

    async isPro(hostId: string): Promise<boolean> {
        const { data, error } = await this.client.rpc('is_pro_host', {
            p_user_id: hostId,
        } as never);
        if (error) return false;
        return (data as unknown as boolean) === true;
    }

    async paidEventCount30d(hostId: string): Promise<number> {
        const { data, error } = await this.client.rpc('host_paid_event_count_30d', {
            p_user_id: hostId,
        } as never);
        if (error) return 0;
        return Number(data ?? 0);
    }
}
