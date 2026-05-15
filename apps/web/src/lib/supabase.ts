import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@pickupvb/supabase/server';

export async function getServerSupabase(): Promise<ReturnType<typeof createSupabaseServerClient>> {
    return createSupabaseServerClient(await cookies());
}
