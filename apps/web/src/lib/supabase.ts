import { cache } from 'react';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@pickupvb/supabase/server';

/**
 * Returns a request-scoped Supabase server client. Wrapped in React `cache()`
 * so repeated calls within the same request share one client instance (and,
 * transitively, share any in-flight auth lookups against it).
 */
export const getServerSupabase = cache(
    async (): Promise<ReturnType<typeof createSupabaseServerClient>> => {
        return createSupabaseServerClient(await cookies());
    },
);
