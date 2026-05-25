'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase';

export async function signOut() {
  const supabase = await getServerSupabase();
  // scope: 'local' revokes only this device/browser's refresh token. Without
  // it, supabase-js's default behavior in some versions is to revoke every
  // active session for the user — which signs the user out everywhere and
  // also breaks parallel e2e workers that share a seeded account.
  await supabase.auth.signOut({ scope: 'local' });
  revalidatePath('/', 'layout');
  redirect('/');
}
