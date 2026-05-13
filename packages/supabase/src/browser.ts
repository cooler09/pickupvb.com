import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types.js';

/**
 * Browser-side Supabase client.
 * Use in React Client Components / hooks.
 */
export function createSupabaseBrowserClient() {
    return createBrowserClient<Database>(
        process.env['NEXT_PUBLIC_SUPABASE_URL']!,
        process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    );
}
