# Performance Audit

**Date:** 2026-05-17
**Scope:** `pickupvb.com` workspace. Next.js 16 App Router, Supabase Postgres,
Vercel runtime. Read-only static review — no profiling, no production
traces. Latency estimates are educated guesses; treat them as relative,
not absolute. Confirm with Vercel Analytics + Supabase slow-query log
before/after each fix.

**Status update (2026-05-17):** Quick-win bundle shipped — see
[Remediation log](#remediation-log) at the bottom.

**Status update (2026-05-22, Bundle 26):** `/events/[id]` got a pragmatic
caching layer — viewer-independent side-loads (read model with `viewerId
= null`, pricing, tip total, primary-host social, ad-hoc team rows) now
flow through `unstable_cache`, 60 s revalidate, tagged `event:{id}`.
Anonymous cold hits skip Supabase entirely on warm cache; signed-in
viewers still fetch the viewer-aware read model but skip ~4 side-loads.
The full structural ISR refactor of `/events/[id]` (lifting RSVP / manage
/ flash-banner chrome out of the page render) remains deferred — see the
[Bundle 26 remediation log entry](#2026-05-22--bundle-26-eventsid-viewer-independent-cache-layer)
and [journal](../journal/2026-05-22-bundle-26.md). P1 #1 status: 3 of 5
target detail pages fully ISR, 1 (`/events/[id]`) partial, 1 (`/events`)
still deferred pending friends/following split.

**Status update (2026-05-22):** No new performance shipments this pass. New
P1: 9 React Compiler warnings now surface in `pnpm lint` — 3 "impure
function during render" (`Date.now()` read in component bodies) and 6
"setState synchronously within an effect" (cascading-render risk). Details
below. `force-dynamic` regression noted: it has re-appeared on three public
pages — [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx),
[pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx), and the
[claim-link page e/[code]/page.tsx](../../apps/web/src/app/e/%5Bcode%5D/page.tsx)
— so the original P1 #1 is partially re-opened on those routes.

> **2026-05-24 follow-up:** both items above are now resolved. P1 #0
> shipped in [Bundle 2](#2026-05-22--bundle-2-react-compiler-lint-cleanup);
> the public `force-dynamic` regression shipped in the
> [2026-05-22 quick-win bundle](#2026-05-22--quick-win-bundle-landed).
> `pnpm lint` is fully green as of Bundle 11.

**Status update (2026-05-24, Bundle 9):** Event detail page side-loads
collapsed from 4–6 sequential waves down to 2 (wave 1: pricing + viewer
pro + tip-total + host social + eligible-winners + ad-hoc bundle in
parallel; wave 2: breakdown + host payments map + viewer payment status
in parallel — only for paid events). Ad-hoc captain profile fetch JOINed
into the registrations query, removing one more sub-wave RTT. Net: ~3–4
fewer page-level RTTs per event detail render. Closes the page-level
portion of P1 #4. The infrastructure `getDetail()` repository method
still issues two parallel rounds totalling ~17 queries; reducing _that_
query count needs JOINs against co-host profiles + team captains and is
left as a follow-up. See the [Bundle 9 journal](../journal/2026-05-24-bundle-9.md).

**Status update (2026-05-24, Bundle 10):** Infrastructure `getDetail()`
JOIN consolidation shipped. Co-host detail (profiles + groups) now
arrives nested inside the `event_co_hosts` select; team captain profile
now arrives nested inside the `event_teams → teams` join. Three queries
removed from wave 2 (`coHostUsersRes`, `coHostGroupsRes`,
`teamCaptainsRes`); wave 2 drops from 9 → 6 parallel queries. Total
`getDetail()` query count goes from ~17 → ~14. P1 #4 fully resolved at
the page _and_ infrastructure level. Remaining sub-wave (viewer
captained-team member counts) is a small leaf still open; aggregating
it via a PostgREST `count` projection is a future micro-optimization.
See the [Bundle 10 journal](../journal/2026-05-24-bundle-10.md).

**Status update (2026-05-24, Bundle 11):** Three small wins shipped to
close out the easier P2/P3 items, plus a CI/Sentry build fix.

- **P2 #7 — push subscriptions N+1 in the worker:** subscriptions for
  the whole batch are now pre-fetched in one
  `push_subscriptions ... in('user_id', distinctUserIds)` query and looked
  up in a `Map<userId, Sub[]>` during the per-row loop, instead of one
  query per outbox row. A user with N pending push rows now costs 1 lookup
  instead of N.
- **P2 #8 — narrow `event_attendees` select on event detail:** already
  done in an earlier bundle. The select at
  [page.tsx:340](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L340)
  pulls only `(user_id, payment_status, payment_intent_id)`. Marked
  resolved retroactively.
- **P3 #12 — memoize `isPro()`:** wrapped `isPro()` and
  `isPlatformAdmin()` with `React.cache()` so repeated calls during the
  same render share the underlying query. Most relevant for the event
  detail page, which branches on Pro status from multiple side-load paths.
- **CI build hotfix — guard `withSentryConfig`:** Vercel build was
  failing with `TypeError: The "path" argument must be of type string.
Received undefined` because the Sentry plugin was wrapped
  unconditionally and `path.join(undefined, …)`d during source-map upload
  when `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` were not all
  set. Now gated on all three being present; otherwise the bare
  `nextConfig` is exported. Local build was masking the issue because
  `silent: !process.env.CI` suppresses plugin errors outside CI.

See the [Bundle 11 journal](../journal/2026-05-24-bundle-11.md) for the
full rationale and the CI-vs-local asymmetry lesson.

**Status update (2026-05-24, Bundle 12):** Three more small wins shipped
— the last of the easy P2/P3 items.

- **P2 #9 — Stripe webhook dedupe:** swapped `insert`-and-catch-`23505`
  for `upsert(…, { onConflict: 'id', ignoreDuplicates: true }).select('id')`.
  Avoids the ~5–20 ms exception path per redelivery; `[]` from
  `.select()` is the duplicate signal.
- **P2 #10 — Photon timeout:** added `AbortSignal.timeout(1500)` to the
  geocode-autocomplete `fetchPhoton` call so slow Photon doesn't pin a
  user's keystrokes waiting for the Nominatim fallback. Timeout error is
  swallowed by the existing `catch` and falls through to Nominatim.
- **P3 #11 — OG image cache headers:** shared `brandOgImage()` helper now
  emits `Cache-Control: public, immutable, max-age=3600,
stale-while-revalidate=86400`. All four `opengraph-image.tsx` routes
  inherit the header, so the unfurler thundering-herd on share lands on
  Vercel's edge cache instead of Supabase.

See the [Bundle 12 journal](../journal/2026-05-24-bundle-12.md).

**Status update (2026-05-22, Bundle 25):** Three more public pages now
ISR-cacheable for anonymous traffic — `/teams/[id]`, `/groups/[id]`, and
`/players/[id]` — closing the detail-page half of P1 #1 for the three
smaller aggregates. Each page now uses `createSupabaseAnonClient()` +
`export const revalidate = 60`; viewer-conditional chrome (pending-invite,
captain controls, follow/unfollow, manage CTAs, Edit-profile) was peeled
into a single client island per page. Shared loaders
(`loadVisibleHostedEvents`, `loadVisibleGroupHostedEvents`) accept either
client now. `/events` and `/events/[id]` remain deferred — RSVP /
co-host / following overlay needs a wider split. See the
[Bundle 25 journal](../journal/2026-05-22-bundle-25.md).

**Status update (2026-05-24, Bundle 13a):** Listings-Suspense refactor
landed for three of the four listing pages — `/players`, `/groups`, and
`/teams` now render their public lists with a sessionless anon Supabase
client (`createSupabaseAnonClient()`) and `export const revalidate = 60`,
so anonymous traffic can be CDN-cached for a minute. Viewer-only chrome
(`+ New group`, `+ New team`, captained / rostered / pending-invite
sections) moved into client components that fetch their own session via
`createSupabaseBrowserClient()` after hydration. `/events` plus all
`/[id]` detail pages are deferred to a follow-up bundle because the
friends / following / RSVP overlay is wider in scope. See the
[Bundle 13a journal](../journal/2026-05-24-bundle-13a.md).

---

## P1 — biggest impact

### 0. React Compiler / `react-hooks` purity violations 🆕 2026-05-22

- **Where (impure read during render — `Date.now()` returns different values across renders, defeats memoization):**
  - [apps/web/src/app/events/[id]/\_components/event-hero.tsx#L72](../../apps/web/src/app/events/%5Bid%5D/_components/event-hero.tsx#L72) — closing-soon pill window.
  - [apps/web/src/app/events/[id]/page.tsx#L115](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L115) — `const hasStarted = event.startsAt.getTime() <= Date.now()`.
  - [apps/web/src/app/profile/billing/pro/page.tsx#L99](../../apps/web/src/app/profile/billing/pro/page.tsx#L99) — trial-end check.
- **Where (setState synchronously inside `useEffect` — cascading renders):**
  - [apps/web/src/components/address-autocomplete.tsx#L32](../../apps/web/src/components/address-autocomplete.tsx#L32), [#L37](../../apps/web/src/components/address-autocomplete.tsx#L37)
  - [apps/web/src/components/datetime-picker.tsx](../../apps/web/src/components/datetime-picker.tsx) (1)
  - [apps/web/src/components/local-datetime.tsx#L47](../../apps/web/src/components/local-datetime.tsx#L47)
  - [apps/web/src/components/mobile-menu.tsx#L25](../../apps/web/src/components/mobile-menu.tsx#L25)
  - [apps/web/src/components/share-link.tsx#L35](../../apps/web/src/components/share-link.tsx#L35)
  - [apps/web/src/components/user-picker.tsx#L50](../../apps/web/src/components/user-picker.tsx#L50)
- **Issue:** React Compiler can't memoize components that read impure
  values in render, and `setState` synchronously inside `useEffect`
  triggers an extra commit per mount/dep change. These are the only
  warnings reported by `pnpm lint` (9 of the 16 total; the rest are
  stale `eslint-disable` directives and 2 `no-anonymous-default-export`).
- **Fix (impure):** Compute `Date.now()` (and similar `Math.random()` /
  `new Date()` reads) at the page boundary or behind
  [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore)
  / a memoized hook so the value is stable across re-renders. For the
  hero countdown, pass `nowMs` as a prop computed in the server
  component.
- **Fix (setState-in-effect):** For mount-only patterns like
  `setMounted(true)` and `setOrigin(window.location.origin)`, switch to
  `useSyncExternalStore` with a `getServerSnapshot` that returns the
  empty state. For pathname-driven `setOpen(false)`, derive from
  `usePathname()` via a key prop instead of an effect. For query-driven
  `setResults([])`, replace with an early-return derived value.

### 1. `dynamic = 'force-dynamic'` on public pages disables CDN caching

**Status:** 🟡 _Partially resolved 2026-05-22 (Bundle 25)_ — three more
detail pages are now ISR-cacheable for anonymous traffic, on top of the
three listing pages shipped in Bundle 13a:

Bundle 25 (2026-05-22):

- [`/teams/[id]`](../../apps/web/src/app/teams/%5Bid%5D/page.tsx) —
  sessionless anon client, `revalidate = 60`. Pending-invite accept /
  decline, captain controls (Add member, Extra members, Broadcast,
  per-row Remove) moved into
  [`<TeamViewerChrome />`](../../apps/web/src/app/teams/%5Bid%5D/_components/team-viewer-chrome.tsx).
- [`/groups/[id]`](../../apps/web/src/app/groups/%5Bid%5D/page.tsx) —
  sessionless anon client, `revalidate = 60`. `GroupHeader` now takes an
  `actions` slot; follow / unfollow / Host event / Edit moved into
  [`<GroupViewerActions />`](../../apps/web/src/app/groups/%5Bid%5D/_components/group-viewer-actions.tsx)
  and the "Manage members →" CTA into `<GroupManageMembersLink />` in
  the same file.
- [`/players/[id]`](../../apps/web/src/app/players/%5Bid%5D/page.tsx) —
  sessionless anon client, `revalidate = 60`. Follow / unfollow /
  sign-in-to-follow / Edit-profile CTAs moved into
  [`<PlayerViewerActions />`](../../apps/web/src/app/players/%5Bid%5D/_components/player-viewer-actions.tsx).
  `isPro()` / `isPlatformAdmin()` stay server-side (admin-client backed,
  not cookie-bound).

Bundle 13a (2026-05-24, listings):

- [`/players`](../../apps/web/src/app/players/page.tsx) — sessionless
  anon client, `revalidate = 60`. Page never reads `cookies()`; viewer
  chrome (none) was never needed.
- [`/groups`](../../apps/web/src/app/groups/page.tsx) — sessionless anon
  client, `revalidate = 60`. "+ New group" CTA moved into
  [`<NewGroupButton />`](../../apps/web/src/app/groups/_components/new-group-button.tsx).
- [`/teams`](../../apps/web/src/app/teams/page.tsx) — sessionless anon
  client, `revalidate = 60`. Captained / rostered / pending-invite
  sections and create-team CTA moved into
  [`<MyTeamsPanel />`](../../apps/web/src/app/teams/_components/my-teams-panel.tsx).

Still open for follow-up:

- [`/events`](../../apps/web/src/app/events/page.tsx) — has friends list,
  following feed, and per-card friend badges; needs a wider split before
  the shell can be cacheable.
- [`/events/[id]`](../../apps/web/src/app/events/%5Bid%5D/page.tsx) —
  RSVP / co-host / waitlist / manage chrome and the host-payment side
  loads need an overlay strategy before the shell can drop `cookies()`.

**Tradeoff accepted (Bundle 25):** the anon Supabase client only sees
public data — `loadVisibleHostedEvents` / `loadVisibleGroupHostedEvents`
called with the anon client return only public events. Private events
that a signed-in viewer would otherwise see on a group/player profile
won't appear on the cached shell. Matches the Bundle 13a tradeoff for
the listing pages and was judged acceptable for the SEO/share-link win.

**Files:**

- [apps/web/src/app/events/page.tsx](../../apps/web/src/app/events/page.tsx#L25)
- [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx#L26)
- [apps/web/src/app/players/page.tsx](../../apps/web/src/app/players/page.tsx#L10)
- [apps/web/src/app/players/[id]/page.tsx](../../apps/web/src/app/players/[id]/page.tsx#L10)
- [apps/web/src/app/groups/page.tsx](../../apps/web/src/app/groups/page.tsx#L8)
- [apps/web/src/app/groups/[id]/page.tsx](../../apps/web/src/app/groups/[id]/page.tsx#L8)
- [apps/web/src/app/teams/page.tsx](../../apps/web/src/app/teams/page.tsx#L9)

**Category:** Caching / revalidation

Every visitor cold-hits Supabase + does 8–12 parallel queries per pageview.
Public listings and detail pages don't change frequently enough to justify
this.

**Fix:** drop `force-dynamic`; use ISR (`export const revalidate = 60`) and
call `revalidatePath()` from join/leave/edit actions. The auth-aware bits
(viewer's RSVP state, "Manage" button) belong inside a small Suspense
boundary or a Client Component that fetches per-user state separately.

**Caveat:** Next.js 16 already auto-marks routes dynamic when they read
`cookies()` or `headers()`, so the net win on signed-in pageviews is
smaller than it looks. The big win is anonymous visitor pageviews
(SEO crawlers, share-link clicks, OG previews).

### 2. `dynamic = 'force-dynamic'` on private pages

**Status:** ✅ _Resolved 2026-05-17_ — flag removed from `profile/page.tsx`
and `profile/notifications/page.tsx`. No behavior change; pages remain
dynamic via `cookies()`.

**Files:** [apps/web/src/app/profile/page.tsx](../../apps/web/src/app/profile/page.tsx#L16), [apps/web/src/app/profile/notifications/page.tsx](../../apps/web/src/app/profile/notifications/page.tsx#L7)
**Category:** Caching / revalidation

Profile pages call `getServerSupabase()` → `cookies()`, so they're already
dynamic. The `force-dynamic` flag is redundant. Remove it for clarity;
no behavioral change expected but it makes the codebase's caching story
honest.

### 3. Web-push fanout is sequential

**Status:** ✅ _Resolved 2026-05-17_ — worker now uses
`Promise.allSettled(list.map(sendWebPush))`. Per-row latency O(n) → O(1).

**File:** [apps/web/src/app/api/notifications/worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts#L97)
**Category:** Web push / sequential await

```ts
for (const sub of list) { await sendWebPush(...) }
```

If a user has 3 devices that's 3× the latency. At 100+ devices the worker
hits the `maxDuration = 60s` ceiling and drops notifications.

**Fix:** `await Promise.allSettled(list.map(sub => sendWebPush(...)))`.
Collect errors after; still prune dead subscriptions on 404/410. Reduces
per-notification latency from O(n) to O(1).

### 4. Event detail page does ~14 DB roundtrips

**Status:** ✅ _Resolved 2026-05-24_ — page-level side-loads collapsed
from 4–6 sequential waves to 2 (Bundle 9); ad-hoc captain profile fetch
JOINed into the registrations query (Bundle 9); co-host profile+group
detail JOINed into the `event_co_hosts` select and team captain
profile JOINed into the nested `event_teams → teams` select (Bundle 10).
Wave-2 query count: 9 → 6. Total `getDetail()` query count: ~17 → ~14.
The remaining sub-wave (viewer captained-team member counts) is a
small leaf left for a future micro-optimization.

**Files:**

- [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx#L115)
- [packages/infrastructure/src/supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts#L303)

**Category:** N+1 queries

`getDetail()` does two rounds of `Promise.all()`: 6 queries, then 8 more
(co-hosts, attendees, teams, captains). Parallelized within each round but
the round-trip count itself is high. Estimated ~300–800 ms total when
Postgres is warm.

**Fix:** collapse co-host + profile fetch into one query with `JOIN
profiles`, batch captain fetches by team id list, consider a view or RPC
for the whole detail bundle. Aim for ≤3 queries.

---

## P2 — important

### 5. Missing composite index on `event_attendees(event_id, payment_status)`

**Status:** ✅ _Resolved 2026-05-17_ — migration
[20260529000000_event_attendees_payment_idx.sql](../../supabase/migrations/20260529000000_event_attendees_payment_idx.sql)
added. Apply locally with `pnpm db:migrate`; production picks it up on
the next deploy.

**File:** scan of [supabase/migrations/](../../supabase/migrations/)
**Category:** Missing DB index

Event detail filters `event_attendees` by `(event_id, payment_status)`. Only
`event_id` is indexed. Sequential scan over a few hundred attendees on
large paid events.

**Fix:**

```sql
CREATE INDEX event_attendees_event_payment_idx
  ON event_attendees (event_id, payment_status);
```

### 6. Leaflet marker icons loaded from `unpkg.com`

**Status:** ✅ _Resolved 2026-05-17_ — PNGs copied to
`apps/web/public/leaflet/`; `event-map.tsx` now points at local paths.

**File:** [apps/web/src/components/event-map.tsx](../../apps/web/src/components/event-map.tsx#L7-L13)
**Category:** External call latency

Marker icon PNGs fetched cross-origin from `https://unpkg.com/leaflet@1.9.4/...`
on every map render. No control over caching headers.

**Fix:** copy the three marker PNGs into `apps/web/public/leaflet/` and
point Leaflet's `iconUrl` / `iconRetinaUrl` / `shadowUrl` there.

### 7. Push subscriptions queried per notification

**Status:** ✅ _Resolved 2026-05-24 (Bundle 11)_ — worker now pre-fetches
the distinct push-user set in one `.in('user_id', …)` query before the
loop and looks up via `Map<userId, Sub[]>`. See
[worker route.ts](../../apps/web/src/app/api/notifications/worker/route.ts).

**File:** [apps/web/src/app/api/notifications/worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts#L82)
**Category:** N+1

Worker iterates up to 50 outbox rows; for each, queries
`push_subscriptions` by `user_id`. If 30 of those go to the same user it's
30 redundant lookups.

**Fix:** pre-fetch `push_subscriptions` for the distinct user-id set at
worker startup, then look up in a `Map<userId, subs[]>` during the loop.

### 8. Payment-status map built in JS instead of SQL

**Status:** ✅ _Resolved — logged 2026-05-24 (Bundle 11)_ — the
host-payments side-load in [page.tsx#L340](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L340)
already selects only `(user_id, payment_status, payment_intent_id)`
and the viewer-payment side-load selects only `payment_status`. Fix
landed in an earlier bundle; marked resolved here for the audit
record.

**File:** [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx#L140)
**Category:** N+1 / DB inefficiency

Fetches the entire `event_attendees` row set for the event, then loops in
JS to build `Map<userId, status>`. Wasted bandwidth + JS time.

**Fix:** narrow the select to `(user_id, payment_status)` and do the
lookup directly off the returned array. For very large events, push the
join into the same query that fetched attendees in the first place.

### 9. Stripe webhook dedupe relies on unique-violation exception

**Status:** ✅ _Resolved 2026-05-24 (Bundle 12)_ — webhook now uses
`upsert({ id, event_type }, { onConflict: 'id', ignoreDuplicates: true })
  .select('id')`; empty `data` indicates a redelivery. See
[stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts).

**File:** [apps/web/src/app/api/webhooks/stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts#L60)
**Category:** External call latency

Insert-then-catch `23505` works but the exception path costs ~5–20 ms each
retry.

**Fix:** use `upsert({ ... }, { onConflict: 'id', ignoreDuplicates: true })`
or a `SELECT … FOR UPDATE` check first. Minor but cheap.

### 10. Geocode fallback waits for Photon before trying Nominatim

**Status:** ✅ _Resolved 2026-05-24 (Bundle 12)_ — `fetchPhoton` now
passes `signal: AbortSignal.timeout(1500)`; the resulting `TimeoutError`
is swallowed by the existing `catch` and the autocomplete handler falls
through to Nominatim. See
[geocode/autocomplete/route.ts](../../apps/web/src/app/api/geocode/autocomplete/route.ts).

**File:** [apps/web/src/app/api/geocode/autocomplete/route.ts](../../apps/web/src/app/api/geocode/autocomplete/route.ts#L159)
**Category:** External call latency

When Photon is slow, users wait the full Photon timeout before the
Nominatim fallback fires.

**Fix:** add a 1–2 s `AbortSignal.timeout()` to the Photon call. Optionally
race both with `Promise.any` and return the first success; cancel the
loser.

---

## P3 — nice to have

### 11. OG-image routes query DB synchronously, uncached

**Status:** ✅ _Resolved 2026-05-24 (Bundle 12)_ — shared
[`brandOgImage()`](../../apps/web/src/lib/og-image.tsx) now emits
`Cache-Control: public, immutable, max-age=3600,
stale-while-revalidate=86400` on every OG render. All four
`opengraph-image.tsx` routes inherit it via the helper.

**Files:**

- [apps/web/src/app/events/[id]/opengraph-image.tsx](../../apps/web/src/app/events/[id]/opengraph-image.tsx)
- [apps/web/src/app/players/[id]/opengraph-image.tsx](../../apps/web/src/app/players/[id]/opengraph-image.tsx)
- [apps/web/src/app/teams/[id]/opengraph-image.tsx](../../apps/web/src/app/teams/[id]/opengraph-image.tsx)
- [apps/web/src/app/groups/[id]/opengraph-image.tsx](../../apps/web/src/app/groups/[id]/opengraph-image.tsx)

**Category:** External call latency / caching

When a link gets shared, Discord/Slack/Twitter all fetch the OG image in
parallel — that's a cache-miss thundering herd against Supabase.

**Fix:** set `Cache-Control: public, max-age=3600, immutable` on the OG
route responses, or precompute and store in Supabase Storage. Easy win
once the route is opted out of dynamic.

### 12. `isPro()` checked per event-detail render

**Status:** ✅ _Resolved 2026-05-24 (Bundle 11)_ — `isPro()` and
`isPlatformAdmin()` are now wrapped in `React.cache()` so repeated calls
during the same request share a single underlying lookup. See
[lib/pro.ts](../../apps/web/src/lib/pro.ts) and
[lib/admin.ts](../../apps/web/src/lib/admin.ts).

**File:** [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx#L120)
**Category:** External call latency

Single query per pageview, ~5–10 ms. Multiply by event popularity.

**Fix:** memoize per request via React `cache()` so repeated calls during
the same render share a result. Long-term, surface `is_pro` on the
profile join.

### 13. Notification worker `maxDuration = 60s` + cold start

**File:** [apps/web/src/app/api/notifications/worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts#L23)
**Category:** Cold start

Cron fires every minute; Node cold start eats ~500 ms; once push fanout is
parallelized (P1 #3) the worker has plenty of headroom, but worth a
follow-up: monitor execution time and split into queue tasks if backlog
grows.

---

## ✅ Verified good

- **Existing indexes** — [20260520000000_perf_indexes.sql](../../supabase/migrations/20260520000000_perf_indexes.sql)
  covers `host_id`, `captain_id`, `home_city`, etc.
- **Parallelization** — pages do `Promise.all()` for independent fetches;
  `getDetail()` batches in tiers. Just too many tiers (see P1 #4).
- **Image optimization** — `next/image` with proper `width`/`height`
  everywhere checked; remote-pattern allowlist set in
  [next.config.mjs](../../apps/web/next.config.mjs).
- **Leaflet map SSR** — wrapped in `dynamic({ ssr: false })`
  ([event-map-lazy.tsx](../../apps/web/src/app/events/[id]/_components/event-map-lazy.tsx)).
- **Runtime selection** — Stripe webhook correctly forces
  `runtime = 'nodejs'`; edge-incompatible APIs (`crypto`) aren't used in
  edge routes.
- **`search_events` RPC** — single CTE with `st_dwithin`, no N+1.
- **Bundle hygiene** — no lodash / moment / chart libs. `date-fns` + a
  small day-picker is the date footprint.
- **Client boundaries** — `'use client'` appears in ~43 files, all of them
  legitimately interactive (forms, maps, toggles). Root layout stays
  server-component.
- **Fonts** — system stack only, no font-file requests, no FOIT/FOUT.
- **Stripe idempotency** — dedup table + unique constraint correct.
- **Push subscription cleanup** — worker prunes on 404/410 ([worker:108](../../apps/web/src/app/api/notifications/worker/route.ts#L108)).

---

## Quick-win bundle

These four together would shave the most measurable latency:

1. **(P1 #1, #2)** Drop `dynamic = 'force-dynamic'` from public + private
   pages. Set `revalidate = 60` on public listings and call
   `revalidatePath()` from mutating actions.
2. **(P1 #3)** Parallelize web-push fanout in the worker.
3. **(P2 #5)** Add the `(event_id, payment_status)` composite index.
4. **(P2 #6)** Self-host Leaflet marker PNGs in `public/leaflet/`.

The architectural one — **(P1 #4)** collapsing `getDetail()`'s query count
— deserves its own PR with before/after timings from Supabase's slow-query
log.

---

## Remediation log

### 2026-05-22 — Bundle 26: `/events/[id]` viewer-independent cache layer

| Item                                           | Status     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1 #1 `/events/[id]` cacheable shell (partial) | 🟡 Partial | Pragmatic interim: wrapped viewer-independent side-loads in `unstable_cache` keyed by event id, 60 s revalidate, tagged `event:{id}`. Cached helpers added to [load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts): `loadEventReadModelPublic`, `loadEventPricingCached`, `loadEventTipTotalCached`, `loadPrimaryHostSocialCached`, `loadAdHocRowsCached`. Anonymous viewers (SEO crawlers, link clicks, logged-out browsing) hit zero Supabase round-trips on warm cache; signed-in viewers still fetch the viewer-aware read-model copy but skip ~4 side-loads. `generateMetadata` switched to `loadEventReadModelPublic` to avoid duplicating the metadata fetch. |
| Full ISR shell rewrite                         | 🔴 Open    | The full structural refactor (drop `cookies()`/`searchParams` on the page, lift viewer-aware chrome — RSVP / co-host / waitlist / manage / tip flash banners — into client islands) is still deferred. 17 viewer-aware subcomponents + 7 `searchParams` flash-banner reads make this a multi-bundle change. Tracked for a future PPR-enabled pass.                                                                                                                                                                                                                                                                                                                                                           |
| Mutating-action cache eviction                 | 🟡 Partial | 60 s revalidate is the staleness budget — hosts use the uncached signed-in read-model path so they see their own edits immediately, and other viewers tolerate ≤60 s lag. Mutating actions (RSVP, co-host changes, division edits, etc.) do not call `revalidateTag('event:{id}')` in this bundle; if/when staleness becomes a complaint, sprinkling tag invalidations across the 16 action files is a localized follow-up.                                                                                                                                                                                                                                                                                  |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

See [Bundle 26 journal](../journal/2026-05-22-bundle-26.md) for the
pragmatic-vs-structural decision, the admin-client cache-safety rationale,
and the tradeoffs accepted (60 s anonymous staleness; no per-action tag
invalidation; viewer-aware chrome still inside the dynamic render).

### 2026-05-22 — Bundle 25: force-dynamic Suspense refactor (3 detail pages)

| Item                                  | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1 #1 `/teams/[id]` cacheable shell   | ✅ Done | Dropped `force-dynamic`; switched to `createSupabaseAnonClient()` + `revalidate = 60`. Pending-invite + captain controls moved into [`<TeamViewerChrome />`](../../apps/web/src/app/teams/%5Bid%5D/_components/team-viewer-chrome.tsx).                                                                                                                                        |
| P1 #1 `/groups/[id]` cacheable shell  | ✅ Done | Sessionless anon client + `revalidate = 60`. `GroupHeader` reduced to public props + `actions` slot; viewer-conditional follow/manage CTAs moved into [`<GroupViewerActions />` + `<GroupManageMembersLink />`](../../apps/web/src/app/groups/%5Bid%5D/_components/group-viewer-actions.tsx). `MembersSection`'s `canManage` prop replaced with a `manageSlot` ReactNode prop. |
| P1 #1 `/players/[id]` cacheable shell | ✅ Done | Sessionless anon client + `revalidate = 60`. Follow / unfollow / sign-in / Edit-profile CTAs moved into [`<PlayerViewerActions />`](../../apps/web/src/app/players/%5Bid%5D/_components/player-viewer-actions.tsx). `isPro()` / `isPlatformAdmin()` stay server-side.                                                                                                          |
| Shared loader signature refactor      | ✅ Done | `loadVisibleHostedEvents()` and `loadVisibleGroupHostedEvents()` now take the supabase client as their first argument (typed `HostedEventsLoaderClient = SupabaseClient<Database>`), so callers can pass either a cookie-bound server client or the sessionless anon client. Updated callers: `profile/page.tsx`, the three detail pages.                                      |
| P1 #1 `/events` + `/events/[id]`      | 🔴 Open | Deferred. `/events` needs friends-list / following / per-card friend-badge split before the shell can be cached. `/events/[id]` needs RSVP / co-host / waitlist / manage overlay strategy before dropping `cookies()`.                                                                                                                                                         |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

See [Bundle 25 journal](../journal/2026-05-22-bundle-25.md) for the
slot-pattern decision, the anon-only public events tradeoff, and the
single-island-per-page rationale.

### 2026-05-24 — Bundle 13a: ISR listings-Suspense (3 of 4 pages)

| Item                                                      | Status      | Notes                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add sessionless anon Supabase client                      | ✅ Done     | New [`createSupabaseAnonClient()`](../../packages/supabase/src/anon.ts) exported at `@pickupvb/supabase/anon`. Uses anon/publishable key, `persistSession: false`. Does NOT read cookies, so pages using it can stay ISR-cacheable.                                                                                                                                                           |
| P1 #1 — `/players` ISR shell                              | ✅ Done     | Page swapped from `getServerSupabase()` to `createSupabaseAnonClient()` and gained `export const revalidate = 60`. Listing has no viewer-specific state, so no viewer chrome was needed.                                                                                                                                                                                                      |
| P1 #1 — `/groups` ISR shell + client `<NewGroupButton />` | ✅ Done     | Page now sessionless + `revalidate = 60`. The `+ New group` CTA moved into [`<NewGroupButton />`](../../apps/web/src/app/groups/_components/new-group-button.tsx) (client component using `createSupabaseBrowserClient()`).                                                                                                                                                                   |
| P1 #1 — `/teams` ISR shell + client `<MyTeamsPanel />`    | ✅ Done     | Public "discover" query now uses anon client; `revalidate = 60`. Viewer's captained / rostered / pending-invite sections plus the create-team CTA moved into [`<MyTeamsPanel />`](../../apps/web/src/app/teams/_components/my-teams-panel.tsx). Shared [`<TeamCard />`](../../apps/web/src/app/teams/_components/team-card.tsx) extracted so it's safe to import from both server and client. |
| P1 #1 — `/events` + all `/[id]` detail pages              | 🔴 Deferred | Wider scope: events listing has friends/following + per-card friend badges; detail pages have RSVP / manage / member chrome. Tracked as a follow-up bundle.                                                                                                                                                                                                                                   |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

### 2026-05-24 — Bundle 12: Stripe dedupe / Photon timeout / OG cache

| Item                                            | Status  | Notes                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2 #9 Stripe webhook dedupe via `upsert`        | ✅ Done | Replaced insert-and-catch-`23505` with `upsert(…, { onConflict: 'id', ignoreDuplicates: true }).select('id')`. Empty `data` is the dedupe signal; saves ~5–20 ms per Stripe retry. See [stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts).                                                                                          |
| P2 #10 Photon timeout before Nominatim fallback | ✅ Done | Added `signal: AbortSignal.timeout(1500)` to `fetchPhoton`. Slow Photon now caps at 1.5 s before the existing `catch` returns null and `GET` falls through to Nominatim. See [geocode/autocomplete/route.ts](../../apps/web/src/app/api/geocode/autocomplete/route.ts).                                                                                 |
| P3 #11 OG image `Cache-Control`                 | ✅ Done | Shared [`brandOgImage()`](../../apps/web/src/lib/og-image.tsx) emits `Cache-Control: public, immutable, max-age=3600, stale-while-revalidate=86400` on every OG render. Unfurler thundering-herd on share now lands on Vercel's edge cache rather than Supabase. All four `opengraph-image.tsx` routes inherit it via the helper — no per-route change. |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

### 2026-05-24 — Bundle 11: backend N+1 / batching cleanup + CI hotfix

| Item                                                  | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2 #7 push subscriptions N+1 in notification worker   | ✅ Done | Pre-fetch the distinct push-user set in one query (`push_subscriptions ... in('user_id', userIds)`) before the per-row loop; lookup via `Map<userId, Sub[]>`. A user with N pending push rows now costs 1 lookup. See [worker route.ts](../../apps/web/src/app/api/notifications/worker/route.ts).                                                                                                                              |
| P2 #8 narrow `event_attendees` select on event detail | ✅ Done | Already shipped in an earlier bundle; logged here. Host-payments select narrowed to `(user_id, payment_status, payment_intent_id)`; viewer-payment select narrowed to `payment_status`. See [page.tsx#L340](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L340).                                                                                                                                                              |
| P3 #12 `isPro()` memoization                          | ✅ Done | Wrapped `isPro()` and `isPlatformAdmin()` with `React.cache()`. Per-request dedupe means the event detail page's two `hasProBenefits` branches collapse to one underlying `is_pro_host(uuid)` lookup. See [lib/pro.ts](../../apps/web/src/lib/pro.ts) + [lib/admin.ts](../../apps/web/src/lib/admin.ts).                                                                                                                        |
| CI hotfix — `withSentryConfig` crashes when env unset | ✅ Done | Vercel builds were failing with `TypeError: The "path" argument must be of type string. Received undefined` because the Sentry plugin was wrapped unconditionally and its source-map pipeline `path.join(undefined, …)`d when `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` were not all set. Now gated on all three being present; bare `nextConfig` otherwise. See [next.config.mjs](../../apps/web/next.config.mjs). |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

### 2026-05-24 — Bundle 10: infrastructure `getDetail()` JOIN consolidation

| Item                                           | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 #4 infrastructure `getDetail()` query count | ✅ Done | JOINed co-host profile + group lookups into the `event_co_hosts` select; JOINed captain profile into the nested `event_teams → teams` select via `captain:profiles!teams_captain_id_fkey`. Removed three batched fetches from wave 2 (`coHostUsersRes`, `coHostGroupsRes`, `teamCaptainsRes`). Wave-2 query count: 9 → 6. Total `getDetail()` query count: ~17 → ~14. See [supabase-event-repository.ts `getDetail`](../../packages/infrastructure/src/supabase-event-repository.ts). |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

### 2026-05-24 — Bundle 9: event detail page side-load parallelization

| Item                                            | Status     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 #4 page-level side-load waves (event detail) | 🟡 Partial | Collapsed page-level side-loads in [event detail page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx) from 4–6 sequential waves to 2: wave 1 runs pricing, viewer-pro check, tip-total RPC, primary-host social handles, eligible-winning-teams map, and the ad-hoc registrations bundle in parallel; wave 2 (paid events only) runs breakdown, host payments map, viewer payment status in parallel. Ad-hoc captain profile fetch JOINed into the registrations query, eliminating its sequential second RTT. |
| P1 #4 infrastructure `getDetail()` query count  | 🔴 Open    | Two parallel rounds totalling ~17 queries unchanged. Next bundle should JOIN profile/group lookups for co-hosts and JOIN captain profile into the teams query; aim for ≤3 queries.                                                                                                                                                                                                                                                                                                                                   |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

### 2026-05-22 — Bundle 2: React Compiler lint cleanup

| Item                                                            | Status       | Notes                                                                                                                                                                                                          |
| --------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 #0 `react-hooks/purity` (server-render `Date.now()` reads)   | ✅ Done      | Introduced [render-now.ts](../../apps/web/src/lib/render-now.ts) (`renderNowMs()`); lifted `EventHero` time-derived booleans to the page boundary as a `closingSoon` prop. 3 sites cleaned.                    |
| P1 #0 `react-hooks/set-state-in-effect` (hydration-mount flags) | ✅ Done      | Extracted [use-is-mounted.ts](../../apps/web/src/lib/use-is-mounted.ts) (`useSyncExternalStore`-based). Migrated `local-datetime`, `datetime-picker`, `share-link`; `mobile-menu` pathname-effect ref-guarded. |
| P1 #0 `react-hooks/set-state-in-effect` (debounce-fetch)        | 🟡 Annotated | `address-autocomplete` + `user-picker` use per-line `eslint-disable` with rationale — no cleaner primitive for debounce-then-display flows.                                                                    |

See [Bundle 2 journal](../journal/2026-05-22-bundle-2.md) for rationale.

### 2026-05-22 — Quick-win bundle landed

| Item                                             | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 #1 `force-dynamic` regression on public pages | ✅ Done | Removed `export const dynamic = 'force-dynamic'` from [page.tsx](../../apps/web/src/app/page.tsx), [pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx), [e/[code]/page.tsx](../../apps/web/src/app/e/%5Bcode%5D/page.tsx). Other listed pages remain dynamic via `cookies()`; the architectural Suspense refactor is still the follow-on for real CDN caching. |

### 2026-05-17 — Quick-win bundle landed

| Item                                 | Status     | Notes                                                                                                                                                |
| ------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 #1 force-dynamic on public pages  | 🟡 Partial | Flag dropped from 7 listed pages. Most still dynamic via `cookies()` — the real CDN win needs the per-viewer Suspense refactor (deferred).           |
| P1 #2 force-dynamic on private pages | ✅ Done    | Pure cleanup; profile pages remain dynamic.                                                                                                          |
| P1 #3 sequential push fanout         | ✅ Done    | `Promise.allSettled` over `list.map(sendWebPush)`; `gone`/`errors`/`anyOk` semantics preserved; rejected promises bucket as `threw:<reason>` errors. |
| P2 #5 composite index                | ✅ Done    | New migration `20260529000000_event_attendees_payment_idx.sql`.                                                                                      |
| P2 #6 Leaflet markers                | ✅ Done    | PNGs under `apps/web/public/leaflet/`; `event-map.tsx` updated.                                                                                      |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm build` ✅.

**Still open** (not in quick-win scope):

- **P1 #0 (new 2026-05-22):** React Compiler purity + setState-in-effect warnings (9 sites). ✅ Resolved 2026-05-22 (Bundle 2) — 7 sites refactored via shared helpers, 2 debounce sites annotated.
- **P1 #1 architectural** — actually cache public pages by extracting
  per-viewer state into a Suspense boundary / client component, then
  setting `revalidate = 60`. Until then the listing pages are dynamic
  per request because `getCurrentUser()` reads cookies.
- **P1 #1** — 🟡 Partially resolved 2026-05-24 (Bundle 13a). `/players`,
  `/groups`, `/teams` ISR-cacheable for anonymous traffic via new
  `createSupabaseAnonClient()` + client-component viewer chrome.
  `/events` and all `/[id]` detail pages deferred to a follow-up bundle.
- **P1 #4** — fully resolved 2026-05-24: page-level portion (Bundle 9) and infrastructure `getDetail()` JOIN consolidation (Bundle 10).
- **P2 #7** — ✅ Resolved 2026-05-24 (Bundle 11).
- **P2 #8** — ✅ Resolved (logged 2026-05-24, Bundle 11; fix landed earlier).
- **P2 #9** — ✅ Resolved 2026-05-24 (Bundle 12).
- **P2 #10** — ✅ Resolved 2026-05-24 (Bundle 12).
- **P3 #11** — ✅ Resolved 2026-05-24 (Bundle 12).
- **P3 #12** — ✅ Resolved 2026-05-24 (Bundle 11).
- **P3 #13** — still open (notification worker cold-start monitoring).

---

## Open questions

1. Is there a target page-weight or LCP budget you want me to optimize
   toward? (e.g. "<1.5 s LCP at p75 on 4G").
2. Should public event pages be fully static between mutations (ISR), or
   do you want fresh attendee counts on every view? ISR with a 60 s
   revalidate + `revalidatePath` on join/leave is a reasonable middle.
3. Any push subscriber count we should plan for before #3 becomes urgent?
   (Today it's a quality fix; at 1k+ subs/user it becomes correctness.)
   </content>
   </invoke>
