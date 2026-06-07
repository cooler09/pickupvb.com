# 0015. Browser-side analytics posture — PostHog SDK, no Vercel Analytics

- **Status:** Accepted
- **Date:** 2026-05-27
- **Supersedes (in part):** the Bundle 82 stance that "PostHog captures
  happen server-side only, so no third-party tracking script runs in
  your browser" (recorded in
  [docs/journal/2026-05-digest.md#bundle-82](../journal/2026-05-digest.md#bundle-82)
  and the original privacy policy §5).

## Context

The post-Bundle-82 setup left the product with **no browser-side
visitor instrumentation**:

- Server-side PostHog (`PostHogAnalytics` adapter + `JoinEventHandler`
  outbox + ad-hoc `analytics.capture(...)` call sites) covers business
  events (`event_joined`, `checkout_completed`, `signup_completed`, …)
  but only fires when a request reaches our server. A user who lands
  on `/`, scrolls, clicks around the marketing pages, and bounces
  triggers **zero** events.
- `<WebVitalsClient />` beacons LCP/CLS/INP back to
  `/api/web-vitals` → `analytics.capture('web_vitals', ...)`. That's
  performance data, not product analytics — no `$pageview`, no
  autocapture, no session stitching.
- Bundle 82 retired `@vercel/analytics` + `@vercel/speed-insights`
  on the explicit thesis that we'd ship a beacon-based `$pageview`
  later. The follow-up was scoped, never landed, and the longer the
  gap stayed open the louder the "we have no idea who visits the
  site" question got in operating reviews.

The remaining choices when this ADR was written:

1. **Stay server-only.** Build a custom beacon: every layout render
   emits `analytics.capture('$pageview', { route })`. Cheap, no
   third-party script. **Rejected:** misses the bulk of what makes
   product analytics useful — autocapture (clicks/forms), session
   stitching across anonymous → identified, referrers, devices,
   bounce. We'd be re-implementing the PostHog browser SDK badly
   and would still get nothing on bounce (the user leaves before the
   beacon flushes).
2. **Re-add Vercel Analytics + Speed Insights _and_ ship PostHog
   browser SDK.** Two dashboards, two SDKs in the bundle, marginal
   coverage Vercel adds over PostHog's autocapture + Web Analytics
   tiles ≈ zero. **Rejected:** explicitly reverses Bundle 82's "two
   analytics dashboards is two analytics surfaces" pattern without
   buying anything PostHog doesn't already give us.
3. **Ship PostHog browser SDK only (this ADR).** Single vendor,
   single dashboard, server `capture()` and browser autocapture
   stitch into one Person via the salted-hash distinct id.

## Decision

Ship the **PostHog browser SDK** as a consent-gated client component
mounted from the root layout. Keep Vercel Analytics + Speed Insights
retired.

### Architecture

- **`apps/web/src/lib/server-distinct-id.ts`** computes the same
  `sha256(POSTHOG_DISTINCT_ID_SALT + ':' + userId)` hash used by the
  server adapter
  ([packages/infrastructure/src/posthog-analytics.ts](../../packages/infrastructure/src/posthog-analytics.ts)).
  The raw Supabase user id never reaches the browser; the browser
  only sees the hash. Anonymous (`is_anonymous`) users get `null`
  here — they stay on PostHog's cookie distinct id until they claim
  a real account.
- **`apps/web/src/components/posthog-provider.tsx`** is the consent-
  gated bootstrapper:
  - `useEffect` initializes the SDK only when `shouldInitPostHog({
allowed, apiKey })` is true. Pure function, regression-tested in
    `posthog-provider.test.ts`.
  - `person_profiles: 'identified_only'` — anonymous traffic does
    not create person profiles, keeping the PostHog MAU bill scoped
    to real users.
  - `capture_pageview: 'history_change'` + a `[pathname,
searchParams]`-keyed effect that emits a belt-and-braces
    `$pageview` on App Router soft navigations.
  - `disable_session_recording: true` — replay is a separate
    consent disclosure we're not asking for in this bundle.
  - Listens for a `pickupvb:consent-change` `CustomEvent` from the
    consent banner so revocation flips `opt_out_capturing()` + `reset()`
    immediately, without waiting for a router refresh.
- **`apps/web/src/app/layout.tsx`** resolves `hashedDistinctId` and
  `traits` in parallel with theme / consent / decided state and passes
  them to the provider. Wrapped in `<Suspense fallback={null}>`
  because the provider transitively calls `useSearchParams()`.
- **`CONSENT_COOKIE_VERSION` bumps 1 → 2.** The disclosure materially
  changes — "no third-party tracking script runs in your browser"
  was Bundle 81's privacy-policy commitment and is no longer true.
  Bumping re-prompts every existing user with the updated banner copy.
- **Privacy policy §5 + subprocessor list** rewritten to call out the
  browser SDK explicitly. The "no script in your browser" line is
  removed.

### Environment

Two new public env vars; both can be set to the same value as their
server-side counterparts:

- `NEXT_PUBLIC_POSTHOG_KEY` — same `phc_…` project API key as
  `POSTHOG_API_KEY`. PostHog project keys are designed to be public
  (write-only).
- `NEXT_PUBLIC_POSTHOG_HOST` — same as `POSTHOG_HOST`
  (`https://us.i.posthog.com` by default).

The **secret** that must never be exposed is
`POSTHOG_DISTINCT_ID_SALT`. The browser receives only the resulting
hash, computed server-side per request.

## Consequences

### Wins

- Visitors, page views, sessions, bounce, referrers, device/geo
  breakdowns appear in PostHog Web Analytics without any custom
  beacon code.
- Server `capture()` and browser autocapture for the same human land
  under one Person — funnel analysis spans both surfaces.
- One vendor, one dashboard. Bundle 82's "two analytics surfaces"
  pattern preserved.

### Trade-offs

- **Adds a third-party script to every page** (`posthog-js`, ~50–60 KB
  gzipped on first paint when consent is granted). Mitigated by
  dynamic `import('posthog-js')` inside the effect, so the script is
  not in the entry chunk for users who decline.
- **Re-prompts every existing user** because the cookie version
  bumped 1 → 2. Acceptable — disclosure changed.
- **Browser-side capture is best-effort.** Ad blockers strip the
  script; `denied` consent skips init entirely. Server-side captures
  remain the source of truth for business events (RSVP, checkout,
  signup) precisely because those can't be blocked.

### Follow-ups

- Reconsider `disable_session_recording` after launch traffic
  warrants it — requires a separate consent surface.
- Add a "Manage cookie preferences" affordance somewhere persistent
  (footer link?) so users can revoke after the banner is dismissed.
- Wire PostHog feature flags for the A/B framework slot in the
  analytics audit (P3 #11) — the browser SDK is the natural place
  for variant assignment.

## Reference

- Bundle: see `docs/journal/2026-05-digest.md#bundle-102` (this ADR is
  authored alongside it).
- Test: [apps/web/src/components/posthog-provider.test.ts](../../apps/web/src/components/posthog-provider.test.ts).
- Audit context: [docs/audits/analytics.md](../audits/analytics.md)
  P3 #12 (now reopened-and-resolved-differently).
