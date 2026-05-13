import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

/**
 * Service-role Supabase client. NEVER import this from a browser bundle.
 * Used by the API for trusted writes and admin operations.
 */
export function createSupabaseAdminClient() {
    const url = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'];
    // sb_secret_... key. Server-only.
    const key = process.env['SUPABASE_SECRET_KEY'];
    if (!url || !key) {
        throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set.');
    }
    return createClient<Database>(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}
