'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase';

export async function signOut() {
    const supabase = getServerSupabase();
    await supabase.auth.signOut();
    revalidatePath('/', 'layout');
    redirect('/');
}
