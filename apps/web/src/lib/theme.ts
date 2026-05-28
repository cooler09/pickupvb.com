import { cookies } from 'next/headers';

export const THEME_COOKIE = 'pvb-theme';

/** Resolved theme actually painted by CSS (the `data-theme` attribute). */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * User-facing preference. `'system'` (Bundle 138 — P3 #19) is a
 * device-scoped choice that defers the resolved `Theme` to the OS via
 * `prefers-color-scheme`. The DB profile column still stores only
 * light/dark — `'system'` lives in the device cookie only and is not
 * persisted to the profile.
 */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const DEFAULT_THEME: Theme = 'dark';
export const DEFAULT_PREFERENCE: ThemePreference = 'dark';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * SSR-side resolution. `'system'` falls back to `DEFAULT_THEME` because
 * the server can't read the client's `prefers-color-scheme`. The inline
 * bootstrap script in the root layout corrects this on hydration before
 * paint, so the only flash risk is the gap between SSR HTML arriving and
 * the bootstrap `<script>` parsing — typically a single frame.
 */
export function resolveThemeForSSR(pref: ThemePreference): Theme {
  return pref === 'system' ? DEFAULT_THEME : pref;
}

/** Read the device's preference from the theme cookie. Null when unset. */
export async function readThemePreferenceFromCookies(): Promise<ThemePreference | null> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isThemePreference(value) ? value : null;
}
