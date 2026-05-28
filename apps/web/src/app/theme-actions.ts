'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase';
import { isThemePreference, THEME_COOKIE, type ThemePreference } from '@/lib/theme';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Persist the user's theme preference. Always writes the device cookie
 * (so anonymous visitors keep their choice). For an authenticated user
 * making an explicit light/dark pick, the profile is also updated so the
 * preference follows them across devices. `'system'` is intentionally
 * not persisted to the profile — it's a device-scoped choice (one user
 * might want system on their laptop and pinned dark on their phone), and
 * the DB `theme_preference` column is a light|dark check-constrained
 * text so we couldn't store `'system'` there even if we wanted to.
 */
export async function setTheme(pref: ThemePreference): Promise<void> {
  if (!isThemePreference(pref)) return;

  (await cookies()).set(THEME_COOKIE, pref, {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax',
  });

  if (pref !== 'system') {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // Best-effort; ignore errors so the toggle never blocks the UI.
      await supabase
        .from('profiles')
        .update({ theme_preference: pref } as never)
        .eq('id', user.id);
    }
  }

  revalidatePath('/', 'layout');
}
