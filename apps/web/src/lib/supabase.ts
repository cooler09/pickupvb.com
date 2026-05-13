import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@pickupvb/supabase/server';

export function getServerSupabase(): ReturnType<typeof createSupabaseServerClient> {
    return createSupabaseServerClient(cookies());
}
