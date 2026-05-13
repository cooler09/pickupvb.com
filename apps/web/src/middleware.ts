import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { SUPABASE_COOKIE_OPTIONS } from '@pickupvb/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase auth session on every request.
 *
 * Why this exists:
 *   The browser SDK refreshes the access token on its own, but Server
 *   Components run before any client code, so without middleware the first
 *   render after a token expiry would see a logged-out user. Calling
 *   `getUser()` here forces a refresh and writes the new cookies back so
 *   downstream handlers see the authenticated user immediately.
 */
export async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env['NEXT_PUBLIC_SUPABASE_URL']!,
        process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
                    // Mirror cookies onto BOTH the inbound request (so the rest
                    // of this request sees the refreshed session) AND the
                    // outbound response (so the browser stores them).
                    for (const { name, value } of cookiesToSet) {
                        request.cookies.set(name, value);
                    }
                    response = NextResponse.next({ request });
                    for (const { name, value, options } of cookiesToSet) {
                        response.cookies.set({
                            name,
                            value,
                            ...SUPABASE_COOKIE_OPTIONS,
                            ...options,
                        });
                    }
                },
            },
            cookieOptions: SUPABASE_COOKIE_OPTIONS,
        },
    );

    // Touch the session — triggers a refresh if the access token is stale.
    await supabase.auth.getUser();

    return response;
}

export const config = {
    // Run on every navigation/data request except static assets.
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
