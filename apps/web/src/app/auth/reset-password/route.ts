import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@pickupvb/supabase/server';

/** Password-recovery callback — exchanges the `code` then sends the user to /reset-password. */
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');

    if (code) {
        const supabase = createSupabaseServerClient(cookies());
        await supabase.auth.exchangeCodeForSession(code);
    }
    return NextResponse.redirect(`${origin}/reset-password`);
}
