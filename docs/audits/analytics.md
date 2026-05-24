# Analytics & Marketable-Data Audit

**Date:** 2026-05-24
**Scope:** every analytics / instrumentation surface currently wired in
`apps/web/`, gap analysis vs. the product/marketing decisions we need to
make in the next 12 months (funnels, retention, advertiser-facing
metrics), and a design sketch for a hexagonal `AnalyticsPort` that lets
us capture events server-side without coupling domain or application to
a vendor SDK.
**Method:** read-only static review of `apps/web/`, `packages/*`, and
`docs/monitoring.md`. No live dashboards inspected.

## Status updates

- **2026-05-24** — Bundle 75 closed P1 #1 + P1 #2 (port, adapter,
  taxonomy, first two captures). Bundle 76 closed P1 #4 (PII guardrail
  test in `packages/domain`) and completed the server-side capture
  set for `event_left`, `checkout_started`, `checkout_completed`,
  `host_payout_setup_completed`, and `signup_completed`
  (email / oauth). Bundle 77 closed P1 #3 (first-touch UTM /
  off-domain-referrer attribution: edge cookie stamping in
  `apps/web/src/proxy.ts`, `marketing_attribution` table, signup-time
  upsert + PostHog identify with `utmSource` / `utmMedium` /
  `utmCampaign` traits). Bundle 78 closed P2 #7 first-pass: SQL views
  `metro_health_weekly` + `host_activity_monthly` and the public
  `/about/numbers` ISR page (30-min revalidate, RLS-respecting via
  `security_invoker=on`). Bundle 79 closed P2 #8 (web-vitals →
  product-analytics bridge: client `useReportWebVitals` →
  `/api/web-vitals` beacon → server-side `analytics.capture('web_vitals',
...)` with masked route templates). Bundle 80 closed P2 #6 (server-side
  outbox at the handler boundary): new `packages/application/src/analytics/`
  with a pure mapper (`SpotFilled` → `event_joined`, `SpotReleased` →
  `event_left`) and `dispatchAnalyticsOutbox()`, wired into
  `JoinEventHandler` / `JoinEventWithPositionHandler` /
  `LeaveEventHandler`. Duplicate captures stripped from
  `events/[id]/rsvp-actions.ts` (the refund path keeps its inline
  capture because the Stripe webhook bypasses the handler). Open:
  `signup_completed` with
  `method: 'anon_claim'`, multi-touch / last-touch attribution,
  `position_demand_weekly` view (blocked on schema — no position
  column on `event_free_agents`), press-kit CSV download, and the
  remaining P2 / P3 items. See remediation log.

## Headline

- The product has **no product analytics**. Vercel Analytics
  ([apps/web/src/components/analytics-client.tsx](../../apps/web/src/components/analytics-client.tsx))
  captures auto page-views + referrer + country and `@vercel/speed-insights`
  captures web vitals — that's the whole instrumentation surface. Zero
  custom `track()` calls anywhere under `apps/web/src/`.
- Zero **funnel** data. We can't answer "how many visitors who land on
  `/events/[id]` end up paying?", "how many host-create starts publish?",
  or "how does week-1 retention vary by acquisition channel?".
- Zero **attribution** data. UTM parameters are not captured, persisted,
  or attached to conversions, so paid acquisition cannot be measured —
  we'd have nothing to show an advertiser or sponsor about ROI.
- Zero **marketable / sponsorable** aggregate surfaces. There is no
  public "by the numbers" page (events/week, fill rate, GMV, DAU/WAU/MAU
  by metro) and no SQL views to derive them. Sponsorship conversations
  start cold every time.
- Existing observability tools are **mis-shaped for product analytics**:
  Sentry is for errors (intentionally) and Vercel Analytics has no
  custom-event SDK on the server. Pushing product events into either
  would be a misuse + an integration tax later.
- A hexagonal-safe place to put analytics exists naturally: a
  `domain/shared/analytics-port.ts` port + an
  `infrastructure/posthog-analytics.ts` adapter. The composition root
  ([apps/web/src/lib/handlers.ts](../../apps/web/src/lib/handlers.ts))
  already wires repositories the same way and adding one more port
  follows the pattern.

## P1 — ship before any paid-acquisition spend

### 1. No product-analytics adapter

**Files:**

- [apps/web/src/components/analytics-client.tsx](../../apps/web/src/components/analytics-client.tsx)
  — only analytics surface; auto page-views only.
- [apps/web/src/lib/handlers.ts](../../apps/web/src/lib/handlers.ts) —
  no analytics port wired.

**Category:** core capability gap

We cannot measure any conversion. Every product decision is currently
shipped blind ("does adding a position-picker improve host activation?"
is unanswerable). Worst-case impact: we can't tell if a feature
regressed engagement, can't justify ad spend, can't sell sponsorships
against concrete numbers.

**Recommended fix:** introduce a typed `AnalyticsPort` in `domain/shared/`
plus a `PostHogAnalytics` adapter in `infrastructure/` that uses
`posthog-node` server-side. Wire from the composition root with a noop
fallback when `POSTHOG_API_KEY` is unset (so local dev + CI stay
free-of-network). PostHog over Mixpanel/GA4 because: open-source,
self-host option, generous free tier (1M events/mo), single tool covers
events + funnels + cohorts + feature flags, EU hosting aligns with the
privacy audit. **First implementation lands in Bundle 75 alongside this
audit.**

### 2. No typed event taxonomy

**File:** none — no taxonomy file exists.

**Category:** instrumentation discipline

Ad-hoc `track('thing happened')` calls are the biggest analytics
mistake: drift in event names + props makes funnels unbuildable six
months in. Define the contract before instrumenting.

**Recommended fix:** add a discriminated-union type
`AnalyticsEvent` in `packages/domain/src/shared/analytics-port.ts`
(co-located with the port — it's part of the contract, not a DTO).
Standard props on every event: `metroId`, `eventType`
(`open_play` | `tournament`), `byPosition` (bool), `priceCents`,
`skillTier`, `divisionId`. Initial event names:

- `event_viewed`, `event_create_started`, `event_published`,
  `event_join_clicked`, `event_joined`, `event_left`
- `checkout_started`, `checkout_completed`
- `team_registered`, `signup_completed`
- `host_payout_setup_completed`, `host_payout_received`

Domain code throws `ValidationError` if an unknown event name reaches
the port (closes the door on string drift). **Initial taxonomy lands in
Bundle 75.**

### 3. No UTM capture / attribution

**Status (2026-05-24):** First-touch closed in Bundle 77 — see remediation
log. Multi-touch / last-touch attribution remains deferred.

**Files:** none — no middleware, no DB table.

**Category:** marketing ROI gap

Without UTM persistence we can't tell an advertiser "your $500 brought
us 12 paying hosts and $3,400 of GMV in 30 days." That is the entire
sentence sponsorship deals are made of.

**Recommended fix:** add Edge middleware that, on first request to any
page, stamps a cookie `pickupvb_attr` with
`{ source, medium, campaign, referrer, landingPath, capturedAt }` if
the URL carries `utm_*` or there's an off-domain referrer. On signup
or first conversion event, copy that cookie into a new
`marketing_attribution(user_id, ...)` table (one row per user, first-touch
semantics). Capture the cookie payload as PostHog `$identify` traits
so it's joinable with downstream funnels. Open ADR follow-up:
multi-touch / last-touch model is P3; first-touch is enough to start.

### 4. No PII guardrails defined for the analytics adapter

**Files:** open question — no policy doc, no helper.

**Category:** privacy compliance (cross-references
[privacy.md](privacy.md))

The privacy audit P1 #5 already flagged email leaks in user-facing read
models. The same trap is twice as easy in analytics: a sloppy
`capture('event_joined', { email })` writes regulated PII to a
third-party vendor's storage indefinitely.

**Recommended fix:** the `AnalyticsPort` interface accepts a **typed**
event union (P1 #2). Free-form `props: Record<string, unknown>` is
disallowed. The PostHog adapter:

- Uses a **hashed** user id (sha256 of the Supabase user id + a server
  secret) as `distinct_id`, never the raw uuid.
- Calls `$identify` exactly once with a small allowlist of traits:
  `{ metroId, skillTier, accountAgeDays, isAnonymous }`. No email, no
  display name, no phone.
- Sanitizes any URL props (strips `token=`, `email=`, magic-link
  params).
- Respects `Sec-GPC` and `DNT` request headers — `beforeSend` returns
  `null`.

Document the policy at the top of
`packages/infrastructure/src/posthog-analytics.ts` so any future
contributor adding an event has a one-screen reference.

## P2 — schedule alongside paid acquisition

### 5. Anonymous-auth users have no consent affordance

**File:** none — no banner exists.

**Category:** privacy compliance, ad-tech readiness

Anonymous-auth users (privacy audit P1 #5 context) are silently included
in analytics today via Vercel's auto page-view capture. For a US-only
launch this is defensible, but the moment we run a paid campaign that
targets a CA / EU audience or display ads on the site, an opt-out
banner is table stakes.

**Recommended fix:** ship a minimal cookie banner with two toggles
(Analytics, Marketing) backed by a `pickupvb_consent` cookie. The
`AnalyticsClient` + `PostHogAnalytics` adapter both gate on the cookie.
Default: opt-in for first-party analytics, opt-out for any third-party
ad-tech pixel we add later. Pair with a privacy-policy entry that
lists every analytics destination.

### 6. No server-side capture from domain events

**Status (2026-05-24):** Bundle 80 ships the outbox at the application
handler boundary. `JoinEventHandler` / `JoinEventWithPositionHandler` /
`LeaveEventHandler` now `pullEvents()` after `repo.save(...)` and
dispatch through a pure mapper in
[packages/application/src/analytics/](../../packages/application/src/analytics/).
`event_published`, the checkout / payout captures, and `signup_completed`
remain at their call sites — they carry context not on the aggregate
(Stripe payment ids, anon-claim transitions). Mapper returns `null`
for those domain events; promote when the taxonomy entries gain a
form that can be derived from aggregate state.

**Files:**

- [packages/domain/src/events/volleyball-event.ts](../../packages/domain/src/events/volleyball-event.ts)
  — emits `SpotFilled`, `TeamRegistered`, `EventPublished`, etc. via
  the `AggregateRoot.raise()` mechanism.
- [packages/application/src/commands/](../../packages/application/src/commands/)
  — handlers save aggregates and discard the raised events.

**Category:** instrumentation completeness

Today the only call sites that could capture an event are server
actions (which run after the handler). That's fine for an MVP but
means the handler boundary doesn't enforce coverage — a future
command that bypasses the action layer (e.g. webhook, cron, RPC) would
silently miss instrumentation.

**Recommended fix:** add an "outbox" pattern at the handler boundary —
after `repo.save(aggregate)` returns, iterate `aggregate.pullDomainEvents()`
and ship each one through a domain-event → analytics-event mapper.
Mapper lives in `packages/application/src/analytics/mapper.ts`. Keeps
the analytics-port call site to **one location** even as the surface
grows. Out of scope for Bundle 75 — initial captures land at the action
layer.

### 7. No marketable / sponsorable public surface

**Status (2026-05-24):** Bundle 78 ships the views and the
`/about/numbers` page. Press-kit CSV download deferred —
methodology footer says "available on request" until we have a
sponsor actually asking.

**Files:** none — no `/about/numbers` page, no SQL views.

**Category:** marketing capability gap

Sponsorship and press conversations start with "what are your numbers?".
We have all the data in the DB but no aggregate view, no public page,
and no caching strategy that would survive being linked on social.

**Recommended fix:** add three materialized views (refresh hourly):

- `metro_health_weekly(metro_id, week, events_count, attendees_count, gmv_cents, fill_rate)`
- `host_activity_monthly(host_id, month, events_count, fill_rate, gmv_cents)`
- `position_demand_weekly(metro_id, week, position, demand_count, supply_count)`

Build a `/about/numbers` page that reads these via a single RPC, ISR
30 minutes. Include a "press kit" download with the same numbers as CSV.

### 8. No web-vitals → product-analytics bridge

**Status (2026-05-24):** Bundle 79 ships the bridge. Vercel Speed
Insights is left mounted alongside for parity-validation; retire once
PostHog dashboards confirm comparable numbers (P3 #12).

**File:**
[apps/web/src/app/layout.tsx](../../apps/web/src/app/layout.tsx) — wires
`@vercel/speed-insights` but the metrics never reach PostHog.

**Category:** correlation gap

Web-vitals lives in one tool, conversion data lives in another. Can't
answer "does LCP > 4s correlate with checkout abandonment?".

**Recommended fix:** add a thin client-side observer that mirrors
`web-vitals` events (LCP / CLS / INP) into PostHog as
`web_vitals_*` events with `route` + `value` props. ~30 LOC. Drop
Vercel Speed Insights once we've validated parity (cost saving).

### 9. No cohort / retention dashboard wired

**Files:** PostHog config (will land in Bundle 75).

**Category:** product-analytics completeness

PostHog supports cohorts + retention out of the box but only after a
month or two of event data has accumulated. Wire the cohort
definitions early so the dashboard is populated when we need it.

**Recommended fix:** in PostHog, define cohorts (Active host, Active
attendee, Paid host, Anonymous-auth user) and pin a Retention insight
to the project dashboard. No code change required.

## P3 — opportunistic

### 10. Hashing strategy not specified

**File:** future `posthog-analytics.ts` — pending Bundle 75.

**Category:** privacy hardening

Hashing the Supabase user id with a server secret is what the audit
recommends, but the secret rotation story is undefined. If the secret
ever leaks, hashes become joinable to user ids — defeating the point.

**Recommended fix:** store the secret in
`POSTHOG_DISTINCT_ID_SALT` (env), rotate yearly via a migration that
re-`$identify`s active users under the new hash. Document the rotation
runbook in `docs/monitoring.md`.

### 11. No A/B framework

**Files:** none.

**Category:** product velocity (low priority until we have funnel
baseline data).

**Recommended fix:** PostHog feature-flags support A/B trivially. Wait
for ≥30 days of baseline funnel data before running the first
experiment.

### 12. Vercel Analytics + PostHog overlap

**File:**
[apps/web/src/components/analytics-client.tsx](../../apps/web/src/components/analytics-client.tsx).

**Category:** cost / clarity

Once PostHog has 30 days of page-view data + UTM capture, Vercel
Analytics is redundant. Keep both for the overlap window, then drop
Vercel Analytics from the layout. Vercel Speed Insights is replaced by
P2 #8.

**Recommended fix:** schedule the removal as a Bundle (~30 days after
PostHog goes live).

---

## Design sketch — `AnalyticsPort`

```ts
// packages/domain/src/shared/analytics-port.ts

/** Stable distinct id supplied by the caller. Hash before reaching the
 * vendor SDK (see PostHog adapter). */
export type AnalyticsActorId = string;

/** Discriminated-union of every analytics event. Adding a new event
 * means adding a new variant here — the compiler enforces that every
 * adapter handles it. */
export type AnalyticsEvent =
  | { name: 'event_published'; props: EventPublishedProps }
  | { name: 'event_joined'; props: EventJoinedProps }
  | { name: 'event_left'; props: EventActorProps }
  | { name: 'checkout_started'; props: CheckoutProps }
  | { name: 'checkout_completed'; props: CheckoutCompletedProps }
  | { name: 'signup_completed'; props: { method: 'email' | 'oauth' | 'anon_claim' } }
  | { name: 'host_payout_setup_completed'; props: { hostId: AnalyticsActorId } };

export interface AnalyticsPort {
  /** Identify (or re-identify) an actor with a small allowlist of
   * traits. Safe to call repeatedly; the adapter dedupes. */
  identify(actorId: AnalyticsActorId, traits: AnalyticsTraits): void;
  /** Capture a typed event for `actorId` (or anonymous if undefined). */
  capture(event: AnalyticsEvent, actorId?: AnalyticsActorId): void;
  /** Flush + close any buffered events. Called from serverless `finally`
   * blocks so events reach the vendor before the function freezes. */
  shutdown(): Promise<void>;
}
```

The adapter responsibilities (PostHog implementation):

1. **No PII leaks.** The adapter hashes `actorId` with
   `POSTHOG_DISTINCT_ID_SALT` before any network call.
2. **No drift.** `capture()` is statically exhaustive over the event
   union.
3. **Fail-open.** Network errors are logged via `log.warn` but never
   propagate — analytics must never break a request.
4. **Noop fallback.** When `POSTHOG_API_KEY` is unset (local dev / CI /
   prod without the env var), the composition root resolves to a noop
   adapter so nothing is sent.

Adapter call sites land at the **server-action layer** in Bundle 75
(`events/new/actions.ts` for `event_published`,
`events/[id]/rsvp-actions.ts` for `event_joined`); the outbox refactor
(P2 #6) moved the join/leave captures to the handler boundary in
Bundle 80. `event_published` and the checkout / payout / signup
captures still live at their original call sites — they depend on
context the aggregate doesn't carry (Stripe payment ids, anon-claim
transitions, etc.) so promoting them to the outbox would require
either carrying that context through the aggregate or extending the
outbox to take side-channel data.

## Remediation log

- **2026-05-24, Bundle 75** — Audit authored. Bundle 75 ships P1 #1
  (port + PostHog adapter + noop fallback wired through composition
  root), P1 #2 (initial event taxonomy with 7 events), and the first
  two server-side captures (`event_published` from
  [events/new/actions.ts](../../apps/web/src/app/events/new/actions.ts),
  `event_joined` from
  [events/[id]/rsvp-actions.ts](../../apps/web/src/app/events/%5Bid%5D/rsvp-actions.ts)).
  P1 #3 / #4 and all P2 / P3 items remain open.
- **2026-05-24, Bundle 76** — Completed the server-side capture set
  from P1 #2. New call sites: `event_left` in
  [events/[id]/rsvp-actions.ts](../../apps/web/src/app/events/%5Bid%5D/rsvp-actions.ts)
  (both refund-success and unpaid-leave paths); `checkout_started`
  in [events/[id]/checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts),
  [tip-actions.ts](../../apps/web/src/app/events/%5Bid%5D/tip-actions.ts),
  [team-checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/team-checkout-actions.ts),
  and [roster-team-checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/roster-team-checkout-actions.ts);
  `checkout_completed` for all four payment kinds and
  `host_payout_setup_completed` in the Stripe webhook
  ([api/webhooks/stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts));
  `signup_completed` (email + oauth methods) in
  [auth/callback/route.ts](../../apps/web/src/app/auth/callback/route.ts).
  Closes P1 #4 with a domain-layer Vitest
  ([analytics-port.test.ts](../../packages/domain/src/shared/analytics-port.test.ts))
  that pins `AnalyticsTraits` to the four-key allowlist
  (`metroId`, `skillTier`, `accountAgeDays`, `isAnonymous`) and uses
  `@ts-expect-error` to reject six common PII field names — adding a
  new trait or relaxing the interface to an index signature will fail
  compilation. Deferred to a follow-up bundle: `signup_completed` with
  `method: 'anon_claim'` (anon → email upgrade) needs prior-state
  tracking through the conversion flow; P1 #3 (UTM attribution) and
  all P2 / P3 items remain open. Two minor leniencies worth flagging:
  (a) `host_payout_setup_completed` fires on every `account.updated`
  event where `charges_enabled === true` rather than only on the
  false → true transition, so PostHog sees repeats — dashboards
  filter to first occurrence per actor; tightening would require
  comparing prior mirror state; (b) `event_left` reports
  `byPosition: false` until a leave-by-position UI exists.
- **2026-05-24, Bundle 77** — Closes P1 #3 (first-touch attribution).
  New migration
  [20260614000000_marketing_attribution.sql](../../supabase/migrations/20260614000000_marketing_attribution.sql)
  adds a one-row-per-user table (PK = `user_id` FK profiles, columns
  `source / medium / campaign / content / term / referrer /
landing_path / captured_at / attached_at`) with own-row RLS.
  [apps/web/src/proxy.ts](../../apps/web/src/proxy.ts) stamps a
  `pickupvb_attr` HttpOnly cookie (30-day max-age, JSON payload, fields
  truncated to 256 chars) on requests carrying `utm_*` params or an
  off-domain `Referer`, but only when no prior cookie exists — first
  touch wins. [auth/callback/route.ts](../../apps/web/src/app/auth/callback/route.ts)
  reads the cookie inside the same `ageMs < 60_000` new-account branch
  that fires `signup_completed`, upserts into `marketing_attribution`
  with `onConflict: 'user_id', ignoreDuplicates: true`, calls
  `analytics.identify(user.id, { utmSource, utmMedium, utmCampaign })`
  to attach the UTM trio as PostHog person traits, and clears the
  cookie on the response. `AnalyticsTraits` in
  [analytics-port.ts](../../packages/domain/src/shared/analytics-port.ts)
  is extended with the three UTM keys and the PII guardrail test
  ([analytics-port.test.ts](../../packages/domain/src/shared/analytics-port.test.ts))
  is updated in lockstep. Scope deliberately limited to first-touch:
  multi-touch / last-touch attribution would require either a per-touch
  log table or last-write-wins on the existing row, both with thornier
  semantics around "did the second touch actually convert?" — deferred.
  The `anon_claim` signup method also still needs cross-request state
  tracking and remains open.

- **2026-05-24, Bundle 78** — Closes P2 #7 first-pass (marketable /
  sponsorable public surface). New migration
  [20260615000000_public_numbers_views.sql](../../supabase/migrations/20260615000000_public_numbers_views.sql)
  adds two read-only views with `security_invoker=on` so the RLS of the
  underlying tables continues to apply. `metro_health_weekly` (granted
  to `anon, authenticated`) buckets every `status='published' AND
visibility='public'` event by `(city, date_trunc('week', starts_at))`
  and emits `events_count`, `attendees_count` (sum of paid+none
  `event_attendees` rows plus registered `event_teams`), `gmv_cents`
  (sum of paid `event_attendees.amount_paid_cents`,
  `event_team_payments.amount_paid_cents`, and `event_tips.amount_cents`),
  and `avg_fill_rate` (fill of the primary `event_divisions` row,
  `sort_order=0`, when `capacity_kind='fixed'`). `host_activity_monthly`
  (granted to `authenticated` only) filters by `auth.uid() = host_id`
  inside the view body and returns per-host monthly rollups for an
  eventual self-serve "is my hosting working?" dashboard. New
  [apps/web/src/app/about/numbers/page.tsx](../../apps/web/src/app/about/numbers/page.tsx)
  consumes `metro_health_weekly` with a 30-minute ISR
  (`export const revalidate = 1800`) — server component, uses
  `getAdminSupabase()` so the page stays statically renderable (no
  `cookies()`), aggregates the last 12 weeks into headline stat cards
  (events, attendees, GMV, cities) and a per-city table sorted by
  event count. Added to [sitemap.ts](../../apps/web/src/app/sitemap.ts).
  Methodology footer says press-kit CSV "available on request" —
  deferred until a sponsor actually asks. `position_demand_weekly`
  was scoped out: `event_free_agents` doesn't carry a "position
  requested" column today, so the supply/demand join the audit asked
  for would require a schema change first. Materialized-view refresh
  cron deferred until traffic warrants — at current volume a regular
  view re-evaluated every 30 minutes is fine. The host-self dashboard
  UI consumer of `host_activity_monthly` is also deferred (view is in
  place, no consumer yet).

- **2026-05-24, Bundle 79** — Closes P2 #8 (web-vitals → product
  analytics). New `web_vitals` variant on the `AnalyticsEvent` union
  in [analytics-port.ts](../../packages/domain/src/shared/analytics-port.ts)
  carries `metric` (LCP / CLS / INP / FCP / TTFB / FID), `value`,
  `rating`, `route`, `navigationType` — no PII, all bounded
  enums / numerics. New client component
  [web-vitals-client.tsx](../../apps/web/src/components/web-vitals-client.tsx)
  uses Next's `useReportWebVitals` hook (no new dependency) and
  `navigator.sendBeacon` (with `fetch keepalive` fallback) to POST
  each sample to a new route
  [apps/web/src/app/api/web-vitals/route.ts](../../apps/web/src/app/api/web-vitals/route.ts)
  which zod-validates the payload, resolves the viewer via
  `getViewer()` (anon users capture without an actor id), and calls
  `analytics.capture({ name: 'web_vitals', ... })`. Mounted in
  [layout.tsx](../../apps/web/src/app/layout.tsx) next to
  `AnalyticsClient` + `SpeedInsights`. Route templates collapse
  UUID-shaped and numeric segments back to `[id]` so PostHog rolls
  vitals up by route pattern rather than per-record URL. WebDriver
  is filtered to match `AnalyticsClient`'s `beforeSend` guard.
  Vercel Speed Insights is intentionally left mounted alongside — we
  want a parity window before P3 #12 (drop Speed Insights) lands.
  No client-side PostHog SDK: keeping all capture behind the
  server-side port means the PII guardrail test in
  [analytics-port.test.ts](../../packages/domain/src/shared/analytics-port.test.ts)
  stays the single source of truth for what reaches the vendor.

- **2026-05-24, Bundle 80** — Closes P2 #6 (server-side capture from
  domain events). New
  [packages/application/src/analytics/](../../packages/application/src/analytics/)
  ships a pure mapper
  ([event-analytics-mapper.ts](../../packages/application/src/analytics/event-analytics-mapper.ts))
  that turns `SpotFilled` into `event_joined` and `SpotReleased` into
  `event_left`, with `eventScopedProps()` reading host id, type, metro,
  default-division price, and `byPosition` straight off the
  `VolleyballEvent` aggregate. Mapper returns `null` for every other
  `DomainEvent` so we can grow the taxonomy without touching the
  dispatcher. New
  [dispatch-outbox.ts](../../packages/application/src/analytics/dispatch-outbox.ts)
  calls `aggregate.pullEvents()` and forwards each mapped capture to
  `AnalyticsPort.capture()` inside a per-event try/catch (analytics
  must never break a request).
  [JoinEventHandler / JoinEventWithPositionHandler / LeaveEventHandler](../../packages/application/src/commands/join-event.handler.ts)
  now take an optional `AnalyticsPort` and call
  `dispatchAnalyticsOutbox(event, this.analytics)` after `repo.save(...)`.
  [apps/web/src/lib/handlers.ts](../../apps/web/src/lib/handlers.ts)
  hoists a single `analyticsFromEnv()` instance and passes it into the
  three handler constructors (previously the env factory ran three
  times per request in the action layer). Duplicate inline captures
  removed from
  [events/[id]/rsvp-actions.ts](../../apps/web/src/app/events/%5Bid%5D/rsvp-actions.ts):
  `joinEvent`, `joinEventAtPosition`, and the unpaid-leave branch of
  `leaveEvent` all rely on the outbox now. The refund-success path
  keeps its inline `captureEventLeft` because the Stripe
  `charge.refunded` webhook deletes the `event_attendees` row directly
  via the admin client (it never traverses `LeaveEventHandler`).
  Coverage in
  [event-analytics-mapper.test.ts](../../packages/application/src/analytics/event-analytics-mapper.test.ts)
  pins the SpotFilled / SpotReleased props (price, metro, `byPosition`,
  waitlist + position propagation) and asserts the mapper returns
  `null` for `EventCreated`, `EventPublished`, `EventCancelled`,
  `TeamRegistered`, and `FreeAgentJoined`. Out of scope (deferred):
  `event_published` stays at the create-event action because the
  aggregate doesn't carry the publish-time pricing / division data
  the analytics payload needs; checkout / payout / signup captures
  stay at their original call sites because they depend on Stripe
  side-channel data; refund-driven `event_left` will move to the
  outbox the next time the webhook is refactored to dispatch through
  `LeaveEventCommand`. One instrumentation upgrade comes for free:
  positional join overflow now reports `waitlist: true` because the
  aggregate raises `SpotFilled` with the truthful waitlist flag
  whereas the previous action-layer capture hard-coded `false`.
