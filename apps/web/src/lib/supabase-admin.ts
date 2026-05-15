import 'server-only';
import { createSupabaseAdminClient } from '@pickupvb/supabase/admin';

/**
 * Service-role Supabase client for server code that needs to bypass RLS
 * (webhook handlers, Stripe Connect onboarding, etc.). Use sparingly — most
 * code should go through `getServerSupabase()` so RLS protects user data.
 */
export function getAdminSupabase(): ReturnType<typeof createSupabaseAdminClient> {
    return createSupabaseAdminClient();
}
