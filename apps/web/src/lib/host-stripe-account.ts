import 'server-only';
import { getAdminSupabase } from './supabase-admin';

/**
 * Resolve the host's Stripe Connect account id. Returns null if the host
 * isn't set up to receive payments yet (no row, or charges not enabled).
 *
 * Callers are expected to treat null as "host can't receive money" and
 * either block the action or fall back to a free flow.
 */
export async function getHostStripeAccount(hostId: string): Promise<string | null> {
    const admin = getAdminSupabase();
    const { data } = await admin
        .from('host_stripe_accounts')
        .select('stripe_account_id, charges_enabled')
        .eq('user_id', hostId)
        .maybeSingle();
    type Row = { stripe_account_id: string; charges_enabled: boolean };
    const row = data as unknown as Row | null;
    if (!row || !row.charges_enabled) return null;
    return row.stripe_account_id;
}
