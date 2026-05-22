import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

/**
 * Sessionless Supabase client using the anon/publishable key.
 *
 * Does NOT read or write cookies — use this for public reads (RLS-enforced
 * as anonymous) on pages that need to stay ISR-cacheable. Calling
 * `getServerSupabase()` from a route body reads `cookies()` and auto-marks
 * the route dynamic; this helper does not.
 *
 * If a page needs the viewer's session for some of its UI, render that
 * portion in a `'use client'` component that uses `createSupabaseBrowserClient()`
 * after hydration.
 */
export function createSupabaseAnonClient() {
  return createClient<Database>(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
