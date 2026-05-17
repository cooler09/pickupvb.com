import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@pickupvb/supabase/server';

/**
 * Auth callback — exchanges the `code` for a session cookie, then redirects
 * to `next` if provided (used by the anon-claim flow to send users to
 * /reset-password after they confirm their new email).
 */
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    // Only accept same-origin relative paths. Reject protocol-relative URLs
    // (`//evil.com`) and backslash-prefixed paths (`/\evil.com`) that some
    // user agents will follow off-origin. See docs/audits/security.md P1 #1.
    const rawNext = searchParams.get('next') ?? '/events';
    const next = /^\/(?![/\\])/.test(rawNext) ? rawNext : '/events';

    if (code) {
        const supabase = createSupabaseServerClient(await cookies());
        await supabase.auth.exchangeCodeForSession(code);
    }
    return NextResponse.redirect(`${origin}${next}`);
}


