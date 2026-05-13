import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

/**
 * Service-role Supabase client. NEVER import this from a browser bundle.
 * Used by the API for trusted writes and admin operations.
 */
export function createSupabaseAdminClient() {
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!url || !key) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    }
    return createClient<Database>(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
