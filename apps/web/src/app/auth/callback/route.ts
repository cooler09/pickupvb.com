import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@pickupvb/supabase/server';
import { analytics } from '@/lib/handlers';

/**
 * Cookie stamped by `apps/web/src/proxy.ts` when a visitor arrives via a
 * UTM-tagged link or off-domain referrer. Consumed once here, then
 * cleared. See docs/audits/analytics.md P1 #3.
 */
const ATTR_COOKIE = 'pickupvb_attr';

type AttributionPayload = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  referrer: string | null;
  landingPath: string;
  capturedAt: string;
};

function parseAttribution(raw: string | undefined): AttributionPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AttributionPayload>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    // Defensive normalization — the cookie is HttpOnly + first-party, so
    // tampering requires an already-compromised browser, but be strict
    // about types anyway since this payload reaches third-party PostHog.
    return {
      source: typeof parsed.source === 'string' ? parsed.source : null,
      medium: typeof parsed.medium === 'string' ? parsed.medium : null,
      campaign: typeof parsed.campaign === 'string' ? parsed.campaign : null,
      content: typeof parsed.content === 'string' ? parsed.content : null,
      term: typeof parsed.term === 'string' ? parsed.term : null,
      referrer: typeof parsed.referrer === 'string' ? parsed.referrer : null,
      landingPath: typeof parsed.landingPath === 'string' ? parsed.landingPath : '/',
      capturedAt:
        typeof parsed.capturedAt === 'string' ? parsed.capturedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

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

  const cookieStore = await cookies();
  let clearAttrCookie = false;

  if (code) {
    const supabase = createSupabaseServerClient(cookieStore);
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

        // First-touch attribution: copy the proxy-stamped cookie into
        // marketing_attribution (ON CONFLICT DO NOTHING preserves the
        // first-touch row if the callback re-runs) and forward the UTM
        // trio to PostHog as identify traits. Fail-open — analytics +
        // attribution must never break signup.
        const attr = parseAttribution(cookieStore.get(ATTR_COOKIE)?.value);
        if (attr) {
          clearAttrCookie = true;
          try {
            await supabase.from('marketing_attribution').upsert(
              {
                user_id: user.id,
                source: attr.source,
                medium: attr.medium,
                campaign: attr.campaign,
                content: attr.content,
                term: attr.term,
                referrer: attr.referrer,
                landing_path: attr.landingPath,
                captured_at: attr.capturedAt,
              } as never,
              { onConflict: 'user_id', ignoreDuplicates: true },
            );
          } catch {
            // best-effort
          }
          try {
            analytics.identify(user.id, {
              utmSource: attr.source,
              utmMedium: attr.medium,
              utmCampaign: attr.campaign,
            });
          } catch {
            // best-effort
          }
        }
      }
    }
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  if (clearAttrCookie) {
    // Clear the cookie so a later returning user with a different UTM
    // doesn't reset their first-touch attribution.
    response.cookies.set({
      name: ATTR_COOKIE,
      value: '',
      path: '/',
      maxAge: 0,
    });
  }
  return response;
}
