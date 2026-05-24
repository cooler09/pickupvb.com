import { cache } from 'react';
import { cookies, headers } from 'next/headers';

/**
 * First-party consent cookie consumed by the consent banner and the
 * analytics gate. Not HttpOnly — the banner needs to read it
 * client-side after a Accept/Decline click to hide itself without a
 * full page round-trip. Path `/` so it applies to every route.
 *
 * Privacy posture (US-first, see docs/audits/analytics.md P2 #5):
 *  - Default analytics: `granted` (opt-out model, standard US norm).
 *  - Default marketing: `denied` (we have no ad-tech pixels yet, so
 *    flipping the default is a future opt-in event).
 *  - **Global Privacy Control** (`Sec-GPC: 1`) overrides the default
 *    to `analytics: denied`, matching the commitment in
 *    [legal/privacy](../app/legal/privacy/page.tsx) §11.
 *  - Explicit cookie always wins over both default and GPC: a user
 *    who clicks "Accept" after sending GPC is still capturable.
 */
export const CONSENT_COOKIE = 'pickupvb_consent';
export const CONSENT_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 180; // 180 days
export const CONSENT_COOKIE_VERSION = 1;

export type ConsentDecision = 'granted' | 'denied';

export type ConsentState = {
  v: typeof CONSENT_COOKIE_VERSION;
  analytics: ConsentDecision;
  marketing: ConsentDecision;
  /** ISO timestamp of the user's most recent decision. */
  ts: string;
  /** `true` when the user has actively chosen — false when we're
   * serving a default (no cookie yet, or stale version). */
  decided: boolean;
  /** `true` when the request carried `Sec-GPC: 1`. */
  gpc: boolean;
};

function defaultState(gpc: boolean): ConsentState {
  return {
    v: CONSENT_COOKIE_VERSION,
    analytics: gpc ? 'denied' : 'granted',
    marketing: 'denied',
    ts: new Date(0).toISOString(),
    decided: false,
    gpc,
  };
}

function parseCookie(raw: string | undefined, gpc: boolean): ConsentState {
  if (!raw) return defaultState(gpc);
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (parsed.v !== CONSENT_COOKIE_VERSION) return defaultState(gpc);
    const analytics = parsed.analytics === 'granted' ? 'granted' : 'denied';
    const marketing = parsed.marketing === 'granted' ? 'granted' : 'denied';
    const ts = typeof parsed.ts === 'string' ? parsed.ts : new Date().toISOString();
    return {
      v: CONSENT_COOKIE_VERSION,
      analytics,
      marketing,
      ts,
      decided: true,
      gpc,
    };
  } catch {
    return defaultState(gpc);
  }
}

/**
 * Read the consent state for the current request. Memoized via
 * React `cache()` so the cookie + GPC header are parsed once per
 * request even if many call sites consult it. Server-only — relies
 * on `cookies()` / `headers()` and will throw outside a request
 * scope.
 */
export const readConsent = cache(async (): Promise<ConsentState> => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const gpc = headerList.get('sec-gpc') === '1';
  return parseCookie(cookieStore.get(CONSENT_COOKIE)?.value, gpc);
});

/** Convenience: did the analytics gate let this request through? */
export async function hasAnalyticsConsent(): Promise<boolean> {
  return (await readConsent()).analytics === 'granted';
}

/** Convenience: has the user already chosen, so we can hide the banner? */
export async function isConsentDecided(): Promise<boolean> {
  return (await readConsent()).decided;
}
