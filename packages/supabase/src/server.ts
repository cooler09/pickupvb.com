import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from './database.types.js';

/**
 * Minimal subset of Next's cookie store we depend on.
 * Both `cookies()` (Server Components) and the request/response cookie jars
 * in middleware satisfy this shape.
 */
export interface CookieStore {
    getAll(): Array<{ name: string; value: string }>;
    set(options: { name: string; value: string } & CookieOptions): void;
}

/**
 * Default cookie options applied to every Supabase auth cookie this app writes.
 *
 * - `httpOnly`: kept off so the browser SDK can read the access token. The
 *   refresh token is never exposed to JS thanks to Supabase's chunked storage.
 * - `secure`: required in production; allowed insecure on localhost for DX.
 * - `sameSite: 'lax'`: works for OAuth redirects while still blocking CSRF.
 * - `maxAge`: 1 year. Lets the refresh-token cookie survive browser restarts;
 *   the access token (~1h) is rotated transparently by the middleware.
 */
export const SUPABASE_COOKIE_OPTIONS: CookieOptions = {
    path: '/',
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: 60 * 60 * 24 * 365,
};

/**
 * Server-side Supabase client bound to a Next.js cookie store.
 * Use in Server Components, Route Handlers, and Server Actions.
 */
export function createSupabaseServerClient(cookieStore: CookieStore) {
    return createServerClient<Database>(
        process.env['NEXT_PUBLIC_SUPABASE_URL']!,
        process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
                    try {
                        for (const { name, value, options } of cookiesToSet) {
                            cookieStore.set({
                                name,
                                value,
                                ...SUPABASE_COOKIE_OPTIONS,
                                ...options,
                            });
                        }
                    } catch {
                        // Server Components cannot mutate cookies. The middleware
                        // refreshes the session on the next request, so swallowing
                        // this is safe and expected.
                    }
                },
            },
            cookieOptions: SUPABASE_COOKIE_OPTIONS,
        },
    );
}
