'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase';
import { isTheme, THEME_COOKIE, type Theme } from '@/lib/theme';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Persist the user's theme. Always writes the cookie (so anonymous visitors
 * keep their choice). If the viewer is authenticated, also writes the
 * preference to their profile so it follows them across devices.
 */
export async function setTheme(theme: Theme): Promise<void> {
    if (!isTheme(theme)) return;

    cookies().set(THEME_COOKIE, theme, {
        path: '/',
        maxAge: ONE_YEAR,
        sameSite: 'lax',
    });

    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (user) {
        // Best-effort; ignore errors so the toggle never blocks the UI.
        await supabase
            .from('profiles')
            .update({ theme_preference: theme } as never)
            .eq('id', user.id);
    }

    revalidatePath('/', 'layout');
}
