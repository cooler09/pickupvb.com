import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { SUPABASE_COOKIE_OPTIONS } from '@pickupvb/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * First-touch marketing attribution cookie. Set by `stampAttributionCookie`
 * below; read once at signup time in `apps/web/src/app/auth/callback/route.ts`
 * and copied into `marketing_attribution`. Documented in
 * docs/audits/analytics.md P1 #3.
 */
const ATTR_COOKIE = 'pickupvb_attr';
/** 30 days — long enough to cover most consider/decide windows for the
 * "saw an ad → signed up" funnel without bloating the cookie jar. */
const ATTR_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30;
/** Bound the persisted payload so a crafted URL can't blow past the
 * cookie size budget. Each captured field is also independently
 * truncated. */
const ATTR_FIELD_MAX_LEN = 256;
const ATTR_KNOWN_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

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

function truncate(value: string | null): string | null {
  if (value === null) return null;
  return value.length > ATTR_FIELD_MAX_LEN ? value.slice(0, ATTR_FIELD_MAX_LEN) : value;
}

/**
 * Returns a first-touch attribution payload if the current request
 * carries UTM params OR an off-domain referrer. Returns `null` for
 * direct/internal-navigation requests (no cookie should be set). The
 * caller is responsible for honouring the "first touch wins" rule by
 * only writing the cookie when it isn't already present.
 */
function buildAttributionPayload(request: NextRequest): AttributionPayload | null {
  const url = request.nextUrl;
  const hasUtm = ATTR_KNOWN_PARAMS.some((p) => url.searchParams.has(p));

  const referer = request.headers.get('referer');
  let offDomainReferrer: string | null = null;
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (refUrl.host !== url.host) {
        offDomainReferrer = referer;
      }
    } catch {
      // Malformed Referer header — ignore.
    }
  }

  if (!hasUtm && !offDomainReferrer) return null;

  return {
    source: truncate(url.searchParams.get('utm_source')),
    medium: truncate(url.searchParams.get('utm_medium')),
    campaign: truncate(url.searchParams.get('utm_campaign')),
    content: truncate(url.searchParams.get('utm_content')),
    term: truncate(url.searchParams.get('utm_term')),
    referrer: truncate(offDomainReferrer),
    landingPath: truncate(url.pathname) ?? '/',
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Stamp the first-touch attribution cookie on the outbound response if
 * (a) the request looks like an external arrival (UTM params or
 * off-domain referrer) and (b) we haven't already captured a touch for
 * this browser. Cookie is HttpOnly + SameSite=Lax + Secure in prod;
 * the auth callback is the only consumer. Idempotent — safe to call on
 * every request from the proxy.
 */
function stampAttributionCookie(request: NextRequest, response: NextResponse): void {
  if (request.cookies.has(ATTR_COOKIE)) return;
  const payload = buildAttributionPayload(request);
  if (!payload) return;
  try {
    response.cookies.set({
      name: ATTR_COOKIE,
      value: JSON.stringify(payload),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env['NODE_ENV'] === 'production',
      path: '/',
      maxAge: ATTR_COOKIE_MAX_AGE_S,
    });
  } catch {
    // Cookie too large or otherwise rejected by the runtime — drop
    // silently. Attribution is best-effort and must never break a
    // navigation.
  }
}

/**
 * Refreshes the Supabase auth session on every request.
 *
 * Why this exists:
 *   The browser SDK refreshes the access token on its own, but Server
 *   Components run before any client code, so without middleware the first
 *   render after a token expiry would see a logged-out user. Calling
 *   `getUser()` here forces a refresh and writes the new cookies back so
 *   downstream handlers see the authenticated user immediately.
 *
 *   The same middleware pass also stamps the first-touch UTM /
 *   off-domain-referrer attribution cookie consumed at signup
 *   (`pickupvb_attr`).
 */
export async function proxy(request: NextRequest) {
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

  stampAttributionCookie(request, response);

  return response;
}

export const config = {
  // Run on every navigation/data request except static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
