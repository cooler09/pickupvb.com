import { cookies } from 'next/headers';

export const THEME_COOKIE = 'pvb-theme';
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = 'dark';

export function isTheme(value: unknown): value is Theme {
    return value === 'light' || value === 'dark';
}

/** Read the active theme for this request (cookie wins; falls back to default). */
export function readThemeFromCookies(): Theme {
    const value = cookies().get(THEME_COOKIE)?.value;
    return isTheme(value) ? value : DEFAULT_THEME;
}
