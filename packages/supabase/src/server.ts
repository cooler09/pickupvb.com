import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from './database.types.js';

export interface CookieStore {
    get(name: string): { value: string } | undefined;
    set(name: string, value: string, options: CookieOptions): void;
}

/**
 * Server-side Supabase client bound to a Next.js cookie store.
 * Use in Server Components, Route Handlers, and Server Actions.
 */
export function createSupabaseServerClient(cookieStore: CookieStore) {
    return createServerClient<Database>(
        process.env['NEXT_PUBLIC_SUPABASE_URL']!,
        process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
                set(name: string, value: string, options: CookieOptions) {
                    try {
                        cookieStore.set(name, value, options);
                    } catch {
                        // Server Components cannot set cookies; safe to ignore — middleware refreshes.
                    }
                },
                remove(name: string, options: CookieOptions) {
                    try {
                        cookieStore.set(name, '', { ...options, maxAge: 0 });
                    } catch {
                        /* noop */
                    }
                },
            },
        },
    );
}
