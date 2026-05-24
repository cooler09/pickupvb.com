import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@pickupvb/supabase/server';
import { analytics } from '@/lib/handlers';

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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    // Capture signup_completed only for genuinely new accounts (created
    // within the last minute) that aren't anonymous shells. The
    // `anon_claim` method (anon → email upgrade) needs prior-state
    // tracking and is deferred — see docs/audits/analytics.md.
    const user = data?.user ?? null;
    if (!error && user && !user.is_anonymous && user.created_at) {
      const ageMs = Date.now() - new Date(user.created_at).getTime();
      if (Number.isFinite(ageMs) && ageMs < 60_000) {
        const provider = (user.app_metadata as { provider?: string } | undefined)?.provider ?? '';
        const method =
          provider === 'google' || provider === 'apple' || provider === 'facebook'
            ? 'oauth'
            : 'email';
        analytics.capture({ name: 'signup_completed', props: { method } }, user.id);
      }
    }
  }
  return NextResponse.redirect(`${origin}${next}`);
}
