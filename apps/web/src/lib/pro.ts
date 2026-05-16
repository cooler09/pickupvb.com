import 'server-only';
import { getAdminSupabase } from './supabase-admin';

/**
 * Pro Host subscription helpers. Lives in apps/web/src/lib so it can read
 * directly from `host_subscriptions` (service-role only) without leaking the
 * concept into the domain layer — subscriptions are a payments concern, not
 * a volleyball-rules concern.
 *
 * The DB function `is_pro_host(uuid)` is the source of truth; this is a
 * thin TS wrapper so callers can `await isPro(userId)`.
 */

export const PRO_MONTHLY_PRICE_USD = 10;
export const PRO_YEARLY_PRICE_USD = 100;
/** Platform fee for Pro hosts, in basis points (2.5%). */
export const PRO_PLATFORM_FEE_BPS = 250;
/** Free-tier cap on paid events per rolling 30 days. */
export const FREE_PAID_EVENT_CAP_30D = 1;

export async function isPro(userId: string): Promise<boolean> {
    const admin = getAdminSupabase();
    const { data, error } = await admin.rpc('is_pro_host', { p_user_id: userId } as never);
    if (error) return false;
    return (data as unknown as boolean) === true;
}

/** Count of paid events the user has created in the last 30 days. */
export async function hostPaidEventCount30d(userId: string): Promise<number> {
    const admin = getAdminSupabase();
    const { data, error } = await admin.rpc('host_paid_event_count_30d', {
        p_user_id: userId,
    } as never);
    if (error) return 0;
    return Number(data ?? 0);
}

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
    const admin = getAdminSupabase();
    const { data } = await admin
        .from('host_subscriptions')
        .select(
            'status, plan, current_period_end, trial_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id',
        )
        .eq('user_id', userId)
        .maybeSingle();
    return (data as SubscriptionRow | null) ?? null;
}
