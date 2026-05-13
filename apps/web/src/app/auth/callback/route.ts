import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@pickupvb/supabase/server';

/** OAuth callback handler — exchanges the `code` for a session cookie. */
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/events';

    if (code) {
        const supabase = createSupabaseServerClient(cookies());
        await supabase.auth.exchangeCodeForSession(code);
    }
    return NextResponse.redirect(`${origin}${next}`);
}
