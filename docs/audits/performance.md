# Performance Audit

**Date:** 2026-05-17
**Scope:** `pickupvb.com` workspace. Next.js 16 App Router, Supabase Postgres,
Vercel runtime. Read-only static review — no profiling, no production
traces. Latency estimates are educated guesses; treat them as relative,
not absolute. Confirm with Vercel Analytics + Supabase slow-query log
before/after each fix.

> **Note — historical file anchors (P3 #20, 2026-06-07).** Resolved findings
> dated **before 2026-06-06** cite
> [`apps/web/src/app/events/[id]/page.tsx`](../../apps/web/src/app/events/%5Bid%5D/page.tsx)
> line numbers (`#L72` / `#L115` / `#L120` / `#L140` / `#L340` / `#L511`, …)
> that **no longer resolve** — the event-detail page was decomposed (now ~360
> LOC) and its logic relocated. Judge those anchors by the symbol they name, not
> the line. Where the cited code lives now:
>
> - `Date.now()` / `hasStarted` reads and the narrowed per-attendee
>   `event_attendees` / payment-status selects → the event-detail loaders in
>   [`_loaders/load-event-detail.ts`](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts)
>   (`renderNowMs()`, `loadAttendeePayments`, `loadViewerPaymentStatus`) and
>   [`_loaders/event-detail-cache.ts`](../../apps/web/src/app/events/%5Bid%5D/_loaders/event-detail-cache.ts).
> - The infra `getDetail()` read model → the per-concern loaders under
>   [`packages/infrastructure/src/event-detail/`](../../packages/infrastructure/src/event-detail/).
> - `isPro()` memoization → [`apps/web/src/lib/pro.ts`](../../apps/web/src/lib/pro.ts) (unchanged).
> - The application `messages.ts` split (architecture P3-2) moved query/command
>   classes into [`packages/application/src/messages/`](../../packages/application/src/messages/);
>   the `/profile` + `/profile/billing/earnings` diets moved data orchestration
>   into their `_loaders/`. These anchors are **historical** (the findings are
>   resolved) — they're left in place as the record of where the issue was, not a
>   live pointer. New findings must use current `path#Lstart-Lend` anchors.

**Status update (2026-06-08) — fresh re-audit (monetization surface):**
read-only pass over the ~40-commit feature surface added since the 2026-06-07
close-out — **season passes / punch cards** (ADR 0037), **recurring host
memberships**, **Club tier pooled payouts** (ADR 0038), **host referrals** (ADR
0039), the **Club analytics dashboard** + multi-admin Pro, **liability waivers**
(O-9), **sponsor-access decoupling**, **email bounce/complaint suppression**,
**audit log**, and the **player-discoverability sitemap gate**. **The new code is
again mostly performance-clean** — every new monetization table is fully indexed
on its hot read columns, the email-suppression check is batched into the outbox
worker (one query per batch + `Set` lookup, the P2 #7 pattern), the pass /
membership / waiver / referral lib reads are all single-query (no N+1), the
Stripe webhook router is a flat single-await switch, the `event-detail-cache`
loaders all stay cookie-free on the admin client, and the receipts/earnings CSV
routes are year-bounded + RLS-scoped with a batched host-name lookup. Opened
**1 P2 + 3 P3**, all caching-posture / over-fetch / hygiene items — no bugs, no
data-loss, no missing indexes. Full write-up:
[§ Reevaluation — 2026-06-08](#reevaluation--2026-06-08). Headlines:

- **P2 #21** — `sitemap.ts` reads `cookies()` (via `getServerSupabase()`), so the
  single most-crawled endpoint is fully dynamic + uncached, re-running ~5 queries
  (incl. an unbounded `teams` scan) on every crawl. Anon client + `revalidate`
  makes it CDN-cacheable (the Bundle 13a shape).
- **P3 #22** — the new Club analytics dashboard reads `event_payment_audit`
  unbounded (no limit/window) — same class as the deferred `/profile/billing/analytics`.
- **P3 #23** — the event-detail `PassPanel` + `EventWaiverSection` async server
  components run as a **third sequential wave** after `loadEventDetail`, and
  `PassPanel` re-fetches the `events` row (same shape P3 #19 just folded into wave 1).
- **P3 #24** — redundant `force-dynamic` re-accumulated on 5 new private pages
  (no-op, same hygiene class as the resolved P1 #2 / P3 #18).

> **2026-06-09 follow-up — the entire 2026-06-08 re-audit backlog is closed
> (1 P2 + 3 P3 all resolved), quad-green.** #21 sitemap → cookie-free anon client
>
> - `revalidate = 3600` (build flips `/sitemap.xml` `ƒ` → `○ 1h`); #22 club
>   dashboard → cheap narrow all-time read + 24-month windowed detail read (+ dead
>   `months` dropped); #23 event-detail pass/waiver panels → `<Suspense>`-wrapped
>   off the critical path; #24 → redundant `force-dynamic` deleted from the 5 pages
>   (still build `ƒ`). Full write-up:
>   [2026-06-09 remediation log](#2026-06-09--monetization-perf-re-audit-fixes).
>   A follow-on consistency pass then gave `/profile/billing/analytics` the same
>   narrow+windowed shape as #22 (closing that pagination-sweep deferral). The
>   standing open items remain the older deferrals (the `/events` + `/events/[id]`
>   full ISR shells and the migration-gated discovery-feed paging).

**Status update (2026-06-06) — fresh re-audit (202 commits since 05-31):**
read-only pass over the large feature surface added since the last audit —
standalone brackets (ADR 0025), chat messaging, capacity waitlist, free-agent
pickup, leagues container-model, community listings, badges/gamification,
account deletion, and the atomic `save_event` RPC. **The new code is mostly
well-built for performance** (full index coverage on every new table, batched
`.in(...)` reads with no N+1, cursor-paginated chat threads, a fully-batched
league-reminder cron, a correctly-ISR'd standalone-bracket watch page, and the
multi-write→single-transaction `save_event` RPC). Opened **1 P2 + 4 P3**, all
caching-posture / over-fetch / hygiene items — no new bugs or data-loss. Full
write-up + recommended fixes in
[§ Reevaluation — 2026-06-06](#reevaluation--2026-06-06). Headlines:

- **P2 #16** — the new public `/community/[slug]` listing page reads
  `cookies()` for the whole render, so anonymous spectators/crawlers never hit
  ISR/CDN despite the `unstable_cache` data layer behind it (same partial state
  as `/events/[id]`). Highest-value new SEO/share target.
- **P3 #18** — `/brackets` + `/brackets/[id]` carry redundant `force-dynamic`
  (already dynamic via `cookies()` — a no-op, like the resolved P1 #2).
- **P3 #19** — the event-detail capacity-waitlist read is an avoidable third
  sequential wave on full open-play events.

> **2026-06-07 follow-up — the entire 2026-06-06 re-audit backlog is closed
> (1 P2 + 4 P3 all resolved).**
>
> - **P2 #16** — `/community/[slug]` cookie-free server shell + viewer-chrome
>   island (one accepted soft-404 change for non-managers on hidden/removed).
> - **P3 #17** — `/community` listing made cookie-free (CDN-cacheable per-URL
>   like `/players`); the submitter's auto-hidden-listing recovery path preserved
>   via a new `listHiddenBySubmitter` port + `<MyHiddenCommunityListings />`
>   island (the original finding missed that the search mixed in own-hidden
>   listings). Surfaced a moderation follow-up: notify the submitter on auto-hide.
> - **P3 #18 / #19** — dropped redundant `force-dynamic` from `/brackets` +
>   `/brackets/[id]`; folded the event-detail waitlist read into wave 1.
> - **P3 #20** — added the historical-anchors note (this header) for the stale
>   `events/[id]/page.tsx` links in resolved findings.
>
> Entries:
> [P3 #20](#2026-06-07--p3-20-historical-file-anchors-note) ·
> [P3 #17](#2026-06-07--p3-17-community-listing-cacheable--own-hidden-recovery) ·
> [P2 #16](#2026-06-07--p2-16-communityslug-isr-cacheable-shell) ·
> [P3 #18/#19](#2026-06-07--p3-18--p3-19-redundant-force-dynamic--waitlist-wave-fold).
> The standing open items are the older deferrals (the `/events` + `/events/[id]`
> full ISR shells under P1 #1, and the migration-gated discovery-feed paging),
> not re-audit findings.

**Status update (2026-05-31) — pagination sweep (unbounded UI lists):** a
read-only scan for list views that render an entire result set with no paging,
prompted by the `/profile` Hosting section. Found and **fixed 6 P2 list views**,
all reusing the shared
[`Pagination`](../../apps/web/src/components/pagination.tsx) control + the
established in-memory-slice convention (the group/player past-events pattern) —
no schema or domain-port changes. Resolved: `/profile` Hosting,
`/profile/receipts`, the `/profile/billing/earnings` "By event" table, the
`/events/[id]` open-play attendee roster, `/friends`, and
`/groups/[id]/members`. A follow-up P3 pass then paged the profile
**Following + Videos** sub-lists the same way (Groups left unpaged on purpose —
bounded + owns its own count). The two migration-backed P3 items (the 50-row
inbox cap, the `/events` + `/community` discovery-feed caps) are **deferred** —
both need a production RPC migration, and the feeds also need a feed-vs-directory
product call. Full write-up:
[Remediation log](#2026-05-31--pagination-sweep-unbounded-ui-lists) ·
[journal](../journal/2026-05-digest.md#pagination-sweep).

**Status update (2026-05-31) — P2 #14 + P3 #15 resolved:** the two open
spectator-page items from the 2026-05-30 re-audit are shipped.
`/events/[id]/bracket` and `/events/[id]/schedule` dropped `force-dynamic` and
the `getViewer()` cookie round-trip; both now load a new lightweight
viewer-`null` `getEventBracketMeta` projection (2 queries vs the ~14-query
`getEventDetail`) on the admin client and resolve host/captain controls
client-side via a shared `useEventManageCaps` hook (the Bundle 25
`TeamViewerChrome` pattern), reaching parity with the already-correct
`/bracket/watch` posture. `/bracket/watch` also switched to the lightweight
query. Full-route CDN caching stays bounded by the `division` searchParam (the
same constraint `/watch` has) — left as a deferred follow-up. Full write-up:
[Remediation log](#2026-05-31--bracket--schedule-cacheable-spectator-pages-p2-14--p3-15)

- [journal](../journal/2026-05-digest.md#bracket-schedule-cacheable).

**Status update (2026-05-30) — fresh re-audit:** read-only pass over the
feature surface added since the 2026-05-17 audit (brackets, leagues, event
divisions, ad-hoc + walk-in registrations, community listings). Opened
**1 P2 + 1 P3** — full write-up + recommended fixes in
[§ Reevaluation — 2026-05-30](#reevaluation--2026-05-30).

- **P2 #14 — public spectator pages re-open the `force-dynamic` regression.**
  The new `/events/[id]/bracket` and `/events/[id]/schedule` pages set
  `export const dynamic = 'force-dynamic'` and load the viewer-scoped
  `getEventDetail`, so every anonymous spectator load bypasses the CDN **and**
  the cached viewer-independent read model — the exact class P1 #1 fixed for
  the teams/groups/players detail pages. The sibling `/bracket/watch` page
  already demonstrates the cacheable pattern (`getEventDetail(id, null)` +
  realtime refresher, no `force-dynamic`).
- **P3 #15 — bracket/schedule pages over-fetch event metadata.** Both call the
  full `getEventDetail` (~14-query read model) but only consume
  `type` / `divisions` / `canManage` / `title`.

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
and [journal](../journal/2026-05-digest.md#bundle-26). P1 #1 status: 3 of 5
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
left as a follow-up. See the [Bundle 9 journal](../journal/2026-05-digest.md#bundle-9).

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
See the [Bundle 10 journal](../journal/2026-05-digest.md#bundle-10).

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

See the [Bundle 11 journal](../journal/2026-05-digest.md#bundle-11) for the
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

See the [Bundle 12 journal](../journal/2026-05-digest.md#bundle-12).

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
[Bundle 25 journal](../journal/2026-05-digest.md#bundle-25).

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
[Bundle 13a journal](../journal/2026-05-digest.md#bundle-13a).

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

## Reevaluation — 2026-06-08

Read-only re-audit against HEAD, graded with the
[audits README rubric](README.md#how-findings-are-graded) (P1 = bug /
data-loss / broken behavior; P2 = important hardening/quality; P3 =
nice-to-have). Scope: the ~40-commit monetization surface added since the
2026-06-07 close-out — **season passes / punch cards** (ADR 0037), **recurring
host memberships**, **Club tier pooled payouts** (ADR 0038), **host referrals**
(ADR 0039), the **Club analytics dashboard** + multi-admin Pro, **liability
waivers** (O-9), **sponsor-access decoupling**, **email suppression**, the
**audit log**, and the **player-discoverability sitemap gate**. No profiling;
latency/cost notes are static-analysis estimates.

### What's well-built (no findings)

The recurring 2026-05 smells (N+1 fan-out, missing indexes, sequential awaits,
unbounded loads) are again largely absent across the new surface:

- **Index coverage on every new table.** `host_passes(host_id, status)`,
  `pass_purchases(buyer_user_id, payment_status)` + `(host_id, payment_status)`,
  `host_membership_plans(host_id, status)`, `host_memberships(member_user_id,
status)` + `(host_id, status)`, `pro_grants(user_id, granted_until desc)`,
  `referrals(referrer_user_id, status)`, `waiver_signatures(event_id)`,
  `audit_log` entity + actor indexes, `event_waitlist(event_id, created_at)` FIFO
  — all the hot read columns are covered, and the Club/group-subscription rows are
  keyed on `group_id` (PK) + unique Stripe-id indexes.
- **Email suppression is batched into the worker** — `drainOneBatch` pre-fetches
  the batch's distinct addresses in one `emailSuppressions.listSuppressed(...)`
  call and skips via a `Set`, exactly the P2 #7 push-subscription pattern, so a
  broadcast burst costs one suppression query per batch, not one per row
  ([worker/route.ts#L186-L193](../../apps/web/src/app/api/notifications/worker/route.ts#L186-L193)).
- **The pass / membership / waiver / referral lib reads are single-query.**
  `listActiveHostPasses`, `getRedeemablePassesForHost`, `listActiveMembershipPlans`,
  `getActiveMembershipForHost`, `getEventWaiver`, `getReferralStats`, and
  `maybeQualifyReferral` each issue one indexed read and reduce in memory — no
  N+1 ([passes.ts](../../apps/web/src/lib/passes.ts),
  [memberships.ts](../../apps/web/src/lib/memberships.ts),
  [referrals.ts](../../apps/web/src/lib/referrals.ts)). The Club gates
  (`isClubGroup` / `hasClubProBenefits`) are `React.cache`-memoized RPC reads
  ([club.ts#L16-L30](../../apps/web/src/lib/club.ts#L16-L30)).
- **The Stripe webhook router is a flat single-await switch** — one handler per
  event type (`charge.dispute.created`, `payment_intent.payment_failed`,
  `customer.subscription.*`, …), each running once per Stripe event, no fanout
  ([stripe/route.ts#L144-L170](../../apps/web/src/app/api/webhooks/stripe/route.ts#L144-L170)).
- **Receipts/earnings CSV routes are bounded.** Both are calendar-year-windowed,
  RLS-scoped to the viewer, and resolve host names in one batched
  `profiles_public.in('id', hostIds)` lookup
  ([receipts/[year]/statement.csv/route.ts#L59-L84](../../apps/web/src/app/api/receipts/%5Byear%5D/statement.csv/route.ts#L59-L84)).
- **The event-detail cache layer stays cookie-free.** The new sponsor / badges /
  media / hero cached loaders all resolve the admin client via dynamic `import()`
  inside `unstable_cache` and tag on `eventCacheTag(id)` — no `cookies()` in a
  cached callback (the Next 16 pitfall)
  ([event-detail-cache.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/event-detail-cache.ts)).

---

### P2 #21 — `sitemap.ts` is cookie-bound (fully dynamic + uncached) and re-runs ~5 queries per crawl 🆕 2026-06-08

**Status:** ✅ _Resolved 2026-06-09_ — swapped `getServerSupabase()` for the
cookie-free `createSupabaseAnonClient()` + added `export const revalidate = 3600`.
The build route table now reports `/sitemap.xml` as `○ … 1h` (static + 1h ISR)
instead of dynamic `ƒ`, so a recrawl serves cached XML rather than re-running ~5
Supabase queries; RLS still filters to public rows for the anon role. The
unbounded `teams` scan is left as the documented future pagination switch. See
the [2026-06-09 remediation log](#2026-06-09--monetization-perf-re-audit-fixes).
**Category:** Caching / revalidation
**Files:**

- [apps/web/src/app/sitemap.ts#L83](../../apps/web/src/app/sitemap.ts#L83) — `const supabase = await getServerSupabase()` (reads `cookies()` → forces the route dynamic; no `export const revalidate`).
- [apps/web/src/app/sitemap.ts#L113](../../apps/web/src/app/sitemap.ts#L113) — `supabase.from('teams').select('slug, updated_at')` with **no filter** (full-table scan). The events read is bounded (public / non-draft / last 30d), but groups / teams / discoverable-players / community-listings are each a full read.

**Issue:** The sitemap is the single most-crawled dynamic endpoint (Google, Bing,
social unfurlers hit it on every recrawl), and it's inherently viewer-independent
public content. But it resolves data through `getServerSupabase()`, which reads
`cookies()` — so Next marks the route fully dynamic and **every crawl is an origin
render issuing ~5 Supabase queries** (events + groups + an unfiltered `teams`
scan + discoverable players + active community listings) with no edge cache in
front. Unlike the content detail pages (whose data sits behind `unstable_cache`),
the sitemap has **no cache layer at all** — it's the same "public + viewer-
independent but never cached" class as P1 #1's listing pages, on the one endpoint
crawlers fetch most. The file's own comment acknowledges the unbounded scan
("If/when the catalog grows large enough that this is slow, switch to a generator
that paginates").

**Why P2:** Pure caching/cost regression (not broken behavior), but on the
highest-frequency crawler endpoint with zero caching today, and it does an
unbounded table scan. Graded P2 (schedule it) rather than P3 — it's worse than
the cached-data-uncached-shell partial state, since there's no `unstable_cache`
behind it. Currently low-urgency only because the pre-launch catalog is small.

**Fix:** Mirror the Bundle 13a listing shape — swap `getServerSupabase()` for
`createSupabaseAnonClient()` (no cookies → the route can be cached; RLS still
filters to public rows for the anon role) and add `export const revalidate = 3600`
(a sitemap doesn't need per-request freshness; newly-published events tolerate up
to an hour, and mutating actions don't need to evict it). The unbounded `teams`
scan is acceptable while the catalog is small; the documented pagination switch is
the escalation once it isn't.

---

### P3 #22 — Club analytics dashboard reads `event_payment_audit` unbounded 🆕 2026-06-08

**Status:** ✅ _Resolved 2026-06-09_ — split the single unbounded read into (1) a
cheap **all-time** headline read (`action, amount_cents, off_platform` only — no
`events` join, no order; gross/refunded/on-platform-net summed directly, since
payment-intent grouping doesn't change those sums) and (2) a **windowed** detail
read (trailing `DETAIL_WINDOW_MONTHS = 24`) for the per-event table + this-year
totals. Both now filter on `event_id IN (club payout events)` instead of joining
`events.payout_group_id`, so neither audit read carries the join. All-time totals
stay correct across full history; the expensive ordered read no longer grows
unbounded. Page copy notes the per-event table reflects the last 24 months. Also
dropped the dead `months` / `ClubMonthAgg` (computed, never rendered). See the
[2026-06-09 remediation log](#2026-06-09--monetization-perf-re-audit-fixes).
**Category:** Over-fetch / unbounded read
**File:**

- [apps/web/src/app/groups/[id]/analytics/\_loaders/load-club-dashboard.ts#L95-L102](../../apps/web/src/app/groups/%5Bid%5D/analytics/_loaders/load-club-dashboard.ts#L95-L102)

**Issue:** `loadClubDashboard` fetches **every** `event_payment_audit` row that
paid out to the club (`events.payout_group_id = groupId`, `category in (ticket,
tip, team)`), ordered by `occurred_at`, with **no limit and no date window**,
then groups + aggregates in memory. The engagement half of the loader is well-built
(it uses `count: 'exact', head: true` for the attendee total rather than pulling
rows — [#L85-L90](../../apps/web/src/app/groups/%5Bid%5D/analytics/_loaders/load-club-dashboard.ts#L85-L90)),
but the payout-income read grows monotonically with the club's transaction
history. This is the same class as the already-deferred `/profile/billing/analytics`
"loads all host events to aggregate" item (pagination-sweep remediation log) —
a new instance of it on the new Club dashboard.

**Why P3:** Over-fetch on a manager-only (low-fanout) page, not broken behavior;
the cost only materializes for a high-volume club, and matches the deferred
`/profile/billing/analytics` grade. The in-memory grouping is correct — it's the
unbounded fetch that's the concern.

**Fix:** The all-time totals genuinely need the full set, so a naive `.range()`
would break them (the same constraint that kept the receipts page on an in-memory
slice). Two viable options: (a) push the aggregation into a `SECURITY DEFINER`
RPC that returns the per-event / per-month rollups + totals (the DB does the
GROUP BY, the app never materializes the row set); or (b) bound the detail read to
a rolling window (e.g. trailing 24 months) while keeping a separate cheap
`count`/`sum` for the all-time headline. Track alongside the
`/profile/billing/analytics` deferral — same fix shape.

---

### P3 #23 — Event-detail `PassPanel` + `EventWaiverSection` add a third sequential wave (and `PassPanel` re-fetches the `events` row) 🆕 2026-06-08

**Status:** ✅ _Resolved 2026-06-09 (Suspense-wrap)_ — wrapped both `<PassPanel>`
and `<EventWaiverSection>` in `<Suspense fallback={null}>` so they stream
off the critical path instead of blocking the page as a third wave after
`loadEventDetail`. The event-detail shell now paints without waiting on the gated
pass/waiver reads (each panel is still defensive + gated, so non-pass / non-waiver
events render nothing). The deeper option (surface `acceptsPassCredits` on the
read model + drop `PassPanel`'s redundant `events` re-fetch + fold into wave 1)
was deliberately not taken — it touches domain + infra for a P3 micro-opt that
Suspense already removes from the critical path. See the
[2026-06-09 remediation log](#2026-06-09--monetization-perf-re-audit-fixes).
**Category:** Sequential await / over-fetch
**Files:**

- [apps/web/src/app/events/[id]/page.tsx#L297](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L297) — `<PassPanel eventId={event.id} />` (async server component, not Suspense-wrapped).
- [apps/web/src/app/events/[id]/page.tsx#L393](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L393) — `<EventWaiverSection eventId={event.id} … />` (same).
- [apps/web/src/app/events/[id]/\_components/pass-panel.tsx#L48-L52](../../apps/web/src/app/events/%5Bid%5D/_components/pass-panel.tsx#L48-L52) — re-`select`s `host_id, type, accepts_pass_credits` off `events`.
- [apps/web/src/app/events/[id]/\_components/event-waiver-section.tsx#L27-L30](../../apps/web/src/app/events/%5Bid%5D/_components/event-waiver-section.tsx#L27-L30) — `getEventWaiver` → `getViewerSignature` (two sequential awaits).

**Issue:** `loadEventDetail` is `await`ed at the top of the page before any JSX
renders, so the two new async server components in the body — `PassPanel` and
`EventWaiverSection` — only begin their reads **after** the loader's wave 1 + wave
2 complete. They render concurrently with each other (RSC siblings), but neither is
wrapped in `<Suspense>`, so they block the page's HTML response: a **third
sequential wave** on the hottest page in the app. This is the exact shape the
2026-06-07 close-out folded out of the loader for the capacity-waitlist read (P3
#19). Two aggravating sub-costs: `PassPanel` re-fetches the `events` row whose
`host_id` (`event.primaryHostUser.id`) and `type` (`event.type`) are already on
the read model (only `accepts_pass_credits` is not surfaced), and
`EventWaiverSection` chains `getEventWaiver` → `getViewerSignature` serially.
Both `getViewer()` re-calls are cheap (`React.cache`-memoized), and both panels are
tightly gated — `PassPanel` to `open_play && accepts_pass_credits`, `WaiverSection`
to events that have a waiver — so the common event pays nothing.

**Why P3:** Micro-optimization on gated paths (matches the P3 #19 grade), but on
the highest-fanout render in the app, so worth folding in the same way #19 was.

**Fix (two options):**

1. **Lowest-risk:** wrap each panel in `<Suspense fallback={null}>` so they stream
   out-of-band and drop off the critical path — the event-detail shell paints
   without waiting on them. (Minor: they appear a beat late.)
2. **More thorough:** surface `acceptsPassCredits` on the `EventDetailReadModel`
   so the page can gate `PassPanel` from the already-loaded `vm` (dropping the
   redundant `events` re-fetch and the `host_id`/`type` re-reads), then fold the
   remaining pass / membership / waiver reads into the `loadEventDetail` wave-1
   `Promise.all` (the `loadWaitlist` precedent) — keeping them in the initial
   paint but parallel with the rest of the page.

---

### P3 #24 — Redundant `force-dynamic` re-accumulated on 5 new private pages 🆕 2026-06-08

**Status:** ✅ _Resolved 2026-06-09_ — deleted the redundant `export const dynamic
= 'force-dynamic'` from all five pages (replaced with a one-line "dynamic via
cookies" comment). The build route table still reports each as `ƒ` (dynamic via
`cookies()`), confirming the flag was a true no-op — same outcome as the resolved
P1 #2 / P3 #18. The deliberate `events/[id]/manage/page.tsx` keep (commented
"never index") was left untouched. See the
[2026-06-09 remediation log](#2026-06-09--monetization-perf-re-audit-fixes).
**Category:** Caching / revalidation (clarity / stale code)
**Files (each reads `cookies()` via auth, so the flag is a no-op):**

- [apps/web/src/app/profile/passes/page.tsx#L12](../../apps/web/src/app/profile/passes/page.tsx#L12)
- [apps/web/src/app/profile/billing/memberships/page.tsx#L22](../../apps/web/src/app/profile/billing/memberships/page.tsx#L22)
- [apps/web/src/app/profile/billing/passes/page.tsx#L14](../../apps/web/src/app/profile/billing/passes/page.tsx#L14)
- [apps/web/src/app/groups/[id]/analytics/page.tsx#L9](../../apps/web/src/app/groups/%5Bid%5D/analytics/page.tsx#L9)
- [apps/web/src/app/groups/[id]/billing/page.tsx#L20](../../apps/web/src/app/groups/%5Bid%5D/billing/page.tsx#L20)

**Issue:** All five new private pages call `getServerSupabase()` / auth (verified:
each reads `cookies()`), so Next renders them dynamically regardless — the
`export const dynamic = 'force-dynamic'` line does nothing. This is the same
redundant-no-op the resolved P1 #2 cleaned off the profile pages and P3 #18 cleaned
off `/brackets`; it keeps re-accumulating as new private pages are scaffolded.
Harmless at runtime, but it makes the caching story dishonest (a reader can't tell
the flag is inert).

**Why P3:** No behavior change; clarity/hygiene/stale-code only. (Note the one
_deliberate_ keep: `events/[id]/manage/page.tsx` carries `force-dynamic` with a
comment as a belt-and-suspenders "never index this" marker — leave that one.)

**Fix:** Delete the `force-dynamic` line from the five pages above; they stay
dynamic via `cookies()`. Consider a lightweight lint note so it stops
re-accumulating (the same ratchet-behind-cleanup posture as the CTA/field
vocabularies), though that's optional for a P3.

---

## Reevaluation — 2026-06-06

Read-only re-audit against HEAD, graded with the
[audits README rubric](README.md#how-findings-are-graded) (P1 = bug /
data-loss / broken behavior; P2 = important hardening/quality; P3 =
nice-to-have). Scope: the ~202-commit feature surface added since the
2026-05-31 pass — **standalone brackets** (ADR 0025), **chat messaging**
(ADR 0028), **capacity waitlist** (ADR 0036), **free-agent pickup**,
**leagues** container-model, **community listings**, **badges /
gamification** (ADR 0031), **account deletion**, and the **atomic
`save_event` RPC**. No profiling; latency/cost notes are static-analysis
estimates.

### What's well-built (no findings)

The new surface is, on the whole, performance-clean — the recurring smells from
the 2026-05 audits (N+1 fan-out, missing indexes, sequential awaits, unbounded
loads) are largely absent:

- **Index coverage on every new table.** `media_posts(event_id, kind)`,
  `conversations(last_message_at desc)`, `messages(conversation_id, created_at
desc)`, `conversation_participants(user_id)`, `event_waitlist(event_id,
created_at)` (FIFO), `user_badges(user_id)`, `event_badges(event_id,
sort_order)`, `bracket_teams(bracket_id)`, `league_schedule_matches`
  home/away entry-id + reminder indexes — all the hot read columns are covered.
- **Chat is N+1-free.** `loadSenderCards` collects ids and does one
  `profiles_public in(...)` merge-in-JS
  ([supabase-messaging-repository.ts#L284](../../packages/infrastructure/src/supabase-messaging-repository.ts#L284));
  the DM thread pages with a cursor (`PAGE_SIZE = 30`, `limit+1` has-more probe,
  `nextBefore`) at
  [messages/[id]/page.tsx#L52](../../apps/web/src/app/messages/%5Bid%5D/page.tsx#L52);
  liveness uses Supabase realtime, not polling.
- **League-reminder cron is fully batched.** `findDueFixtures` does five set
  reads (`.in(...)` on divisions → events → entries → team_members) and assembles
  in memory — no per-fixture query
  ([league-reminders/route.ts#L42-L132](../../apps/web/src/app/api/notifications/league-reminders/route.ts#L42-L132)).
- **`save_event` RPC collapses the aggregate save** (event + divisions + child
  reconciliation) into one transaction, replacing the old multi-write path
  ([supabase-event-repository.ts#L497-L500](../../packages/infrastructure/src/supabase-event-repository.ts#L497-L500),
  migration `20260919000000_save_event_rpc.sql`) — a correctness **and** a
  round-trip win.
- **Standalone-bracket watch page is correctly ISR'd** (`revalidate = 15`, no
  `force-dynamic`, no `cookies()` — realtime refresher for liveness), the shape
  P2 #14 prescribes
  ([brackets/[id]/watch/page.tsx#L25](../../apps/web/src/app/brackets/%5Bid%5D/watch/page.tsx#L25)).
- **Badge reads are single-query + ISR-cacheable.** `players/[id]` reads the
  trophy case from the anon-granted `user_badges_public` view inside its
  `Promise.all`
  ([players/[id]/page.tsx#L80-L91](../../apps/web/src/app/players/%5Bid%5D/page.tsx#L80-L91));
  event-detail badges/media load via `unstable_cache` helpers in wave 1.

---

### P2 #16 — `/community/[slug]` reads `cookies()` for the whole render → anonymous spectators never hit ISR/CDN 🆕 2026-06-06

**Status:** ✅ _Resolved 2026-06-07_ — applied the Bundle 25 ISR refactor. The
page is now a cookie-free, `searchParams`-free server shell (`export const
revalidate = 60`): viewer-conditional chrome moved into a
`CommunityViewerProvider` client island (one `auth.getUser()`, then a
`getCommunityViewerChrome` server action only for a real session), the `?notice=`
banner into a `<Suspense>`'d `useSearchParams` client component, and the
claimed→event 301 + a cookieless existence probe stay server-side on the admin
client. Build confirms `/community/[slug]` now renders `ƒ` **identically to the
proven-cacheable `/teams/[id]` / `/players/[id]` / `/groups/[id]`** (on-demand
ISR, not the uncached `ƒ` it had while reading `cookies()`). One accepted
behavior change: a non-manager hitting a **hidden/removed** listing now gets a
200 "not available" notice instead of a hard 404 (genuinely-missing slugs still
404; hidden/removed are `noindex`, so SEO-immaterial, and the action enforces the
same RLS/status gate — no leak). Verified `pnpm typecheck && lint && test &&
build` green. See the
[2026-06-07 remediation log entry](#2026-06-07--p2-16-communityslug-isr-cacheable-shell)
and [journal](../journal/2026-06-07-bundle-community-detail-isr.md).

**Category:** Caching / revalidation
**Files:**

- [apps/web/src/app/community/[slug]/page.tsx#L50-L66](../../apps/web/src/app/community/%5Bslug%5D/page.tsx) — `getCurrentUser()` at L53 (reads `cookies()`), then `loadCommunityDetailPage(slug, searchParams, user)`.
- Data layer (already cached): [community-detail-cache.ts](../../apps/web/src/app/community/%5Bslug%5D/community-detail-cache.ts) — `loadCommunityDetailPublic` wraps the viewer-`null` read in `unstable_cache` (60s, `communityListingCacheTag`); the loader correctly routes anon viewers to it ([load-community-detail-page.ts#L88](../../apps/web/src/app/community/%5Bslug%5D/_loaders/load-community-detail-page.ts#L88)).
- Contrast (already correct): [brackets/[id]/watch/page.tsx#L25](../../apps/web/src/app/brackets/%5Bid%5D/watch/page.tsx#L25).

**Issue:** A community listing detail page is inherently public,
viewer-independent spectator content — it emits a canonical URL, OpenGraph
tags, and `CommunityListingJsonLd` structured data, i.e. it's explicitly built
as an SEO/share target. The **data** read is already cached (anon viewers serve
from `unstable_cache` with no Supabase round-trip), but the page unconditionally
calls `getCurrentUser()`, so Next 16 auto-marks the route dynamic and **every
anonymous render is a full origin render** — the `unstable_cache` win is real
but the page shell itself is never CDN/ISR-cached. This is the same "data cached,
shell not" partial state `/events/[id]` is parked in (Bundle 26), now re-created
on a brand-new public page.

**Why P2:** Pure caching/cost regression (not broken behavior) on a public
read path that's specifically optimized for crawlers + share unfurls. Graded P2
to match the detail-page half of P1 #1 and the P2 #14 spectator-page grading.

**Fix:** Apply the Bundle 25 ISR refactor:

1. Drop `getCurrentUser()` from the page; render the public shell from
   `loadCommunityDetailPublic(slug)` and add `export const revalidate = 60`.
2. Lift the viewer-conditional sections — `PendingClaimReview`, the claimant
   "awaiting review" banner, `ClaimSection`, `ReportSection`, `ManageSection`,
   and the `showHiddenWarning` panel — into a single `'use client'`
   viewer-chrome island that resolves the viewer client-side (the
   `<TeamViewerChrome />` pattern). The claimed-listing `permanentRedirect` and
   the claim-eligibility `loadVisibleHostedEvents` calls are viewer-scoped, so
   they move into the island (or a nested dynamic segment) too.
3. Liveness: the listing's mutating actions already evict via
   `updateTag(communityListingCacheTag(slug))`, so tag eviction keeps the cached
   shell current; the 60s `revalidate` is the backstop for the slug-less
   auto-approve cron writer (already documented in `community-detail-cache.ts`).

---

### P3 #17 — `/community` listing is dynamic-per-request + fetches 120 rows uncached 🆕 2026-06-06

**Status:** ✅ _Resolved 2026-06-07_ — dropped `getCurrentUser()` +
`isPlatformAdmin` and passed `viewerId = null` to the (already admin-backed)
search, so the listing render is now **cookie-free**: its response is shared
per-URL across anonymous viewers (CDN-cacheable for 60s) instead of `private`.
The route stays `ƒ` (it reads `searchParams` for filters/paging — that varies by
URL, not by user), matching the cacheable `/players` posture. The "Submit a
listing" CTA + admin import link moved into a `<CommunitySubmitActions />`
client island. **Correction to this finding:** the search was _also_
viewer-conditional in a way the original write-up missed — with `viewerId` it
mixes in the submitter's own auto-hidden listings (the card badges them
"Hidden — only you"), and auto-hide is a notification-less DB trigger, so that
inline surface is the submitter's only path back to an auto-hidden listing.
Dropping `viewerId` would silently strand them, so the recovery path was
preserved via a `<MyHiddenCommunityListings />` client island backed by a new
`CommunityListingRepository.listHiddenBySubmitter` port + a
`getMyHiddenCommunityListings` server action (own-hidden moved from inline to a
top recovery strip). No regression. Verified `pnpm typecheck && lint && test &&
build` green. See the
[2026-06-07 remediation log entry](#2026-06-07--p3-17-community-listing-cacheable--own-hidden-recovery)
and [journal](../journal/2026-06-07-bundle-community-listing-isr.md).

**Category:** Caching / over-fetch
**Files:**

- [apps/web/src/app/community/page.tsx#L71](../../apps/web/src/app/community/page.tsx#L71) — `getCurrentUser()` + `isPlatformAdmin` at L72.
- [apps/web/src/app/community/page.tsx#L101-L114](../../apps/web/src/app/community/page.tsx#L101) — `FETCH_CAP = 120` rows fetched, then `slice` to `PER_PAGE = 24`.

**Issue:** The public `/community` discovery feed (canonical + OpenGraph,
indexable) is dynamic on every request because it reads `cookies()` via
`getCurrentUser()` — the only viewer-conditional output is the "Submit a
listing" CTA (signed-in vs sign-in link) and the admin import link. Each
dynamic render also fetches up to 120 rows to display 24 (the documented
in-memory-slice pattern #12). This is the **same deferred class as `/events`**
(still-open half of P1 #1): a public listing page that can't be cached until the
viewer CTA is split into an island.

**Why P3:** Caching/over-fetch on a listing page, not broken behavior; matches
the `/events` deferral grade. The 120-row fetch is bounded (pattern #12) and
only bites once volume exceeds the cap.

**Fix:** Same shape as the deferred `/events` fix — render the list from
`createSupabaseAnonClient()` + `export const revalidate = 60`, and lift the
"Submit a listing" CTA + admin import link into a `'use client'` island that
fetches its own session (mirrors `<NewGroupButton />`). Track alongside the
`/events` ISR follow-up — both want the same friends/CTA-island split.

---

### P3 #18 — Standalone bracket owner pages carry redundant `force-dynamic` 🆕 2026-06-06

**Status:** ✅ _Resolved 2026-06-07_ — dropped the `export const dynamic =
'force-dynamic'` line from both pages. They stay `ƒ` (server-rendered on demand)
because each reads `cookies()` unconditionally (`requireRealUser` /
`getViewer`), so the flag was a no-op — same outcome as the resolved P1 #2.
Verified `pnpm typecheck && lint && test && build` green. See the
[2026-06-07 remediation log entry](#2026-06-07--p3-18--p3-19-redundant-force-dynamic--waitlist-wave-fold).

**Category:** Caching / revalidation (clarity)
**Files:**

- [apps/web/src/app/brackets/page.tsx#L11](../../apps/web/src/app/brackets/page.tsx#L11) — `export const dynamic = 'force-dynamic'`; the page calls `requireRealUser('/brackets')` (reads `cookies()`).
- [apps/web/src/app/brackets/[id]/page.tsx#L24](../../apps/web/src/app/brackets/%5Bid%5D/page.tsx#L24) — same flag; the page calls `getViewer()` and `redirect`s non-owners to `/watch`.

**Issue:** Both pages are owner-only/private surfaces that already read
`cookies()`, so Next renders them dynamically regardless — the
`force-dynamic` flag is a redundant no-op. This is the exact pattern the
resolved P1 #2 cleaned up on the profile pages: harmless, but it makes the
codebase's caching story dishonest (a reader can't tell the flag does nothing).
The public spectator sibling (`/brackets/[id]/watch`) is already correct.

**Why P3:** No behavior change; clarity/hygiene only.

**Fix:** Delete the `export const dynamic = 'force-dynamic'` line from both
pages. They stay dynamic via `cookies()`; the line was never doing anything.
(Pairs with the AGENTS.md "No `force-dynamic` on public pages" rule — these
aren't public, but the flag should still go.)

---

### P3 #19 — Event-detail capacity-waitlist read is an avoidable third sequential wave 🆕 2026-06-06

**Status:** ✅ _Resolved 2026-06-07_ — extracted a `loadWaitlist(event, user)`
helper that internally applies the `open_play && !positionRoster &&
spotsRemaining === 0` gate (resolving `{ waitlistCount: 0, viewerWaitlistPosition:
null }` otherwise) and folded it into the wave-1 `Promise.all`. The serial
round-trip on full open-play renders is gone; behavior is unchanged (same gate,
same best-effort `catch`). Verified `pnpm typecheck && lint && test && build`
green. See the [2026-06-07 remediation log entry](#2026-06-07--p3-18--p3-19-redundant-force-dynamic--waitlist-wave-fold).

**Category:** Sequential await / extra RTT
**File:**

- [apps/web/src/app/events/[id]/\_loaders/load-event-detail.ts#L363-L382](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts#L363-L382)

**Issue:** The capacity-waitlist read (queue length + viewer's place) runs as a
standalone `await` **after** wave 1 (#L299) and wave 2 (#L328). It depends only
on `event` (resolved before wave 1) and on nothing either wave produces, so it
adds one avoidable round-trip to the event-detail render. It is tightly gated —
only fires for a **full** fixed-capacity open play (`type === 'open_play' &&
!positionRoster && spotsRemaining === 0`) — so the common case pays nothing,
but on exactly the high-fanout "event is full, everyone's refreshing" view it
serializes one extra RTT.

**Why P3:** Micro-optimization on a gated path; cost only materializes on full
open-play events.

**Fix:** Fold the gated read into the wave-1 `Promise.all` — extract a
`loadWaitlist(event, user)` helper that internally applies the
`open_play && !positionRoster && spotsRemaining === 0` gate and resolves
`{ waitlistCount: 0, viewerWaitlistPosition: null }` otherwise, then add it as a
wave-1 entry. Removes the serial RTT on full-event renders with no behavior
change.

---

### P3 #20 — Existing audit's file/line anchors went stale after the post-05-31 refactors 🆕 2026-06-06

**Status:** ✅ _Resolved 2026-06-07_ — added the
[**historical file anchors** note](#performance-audit) in the document header
(the blockquote under the scope paragraph). It flags that resolved findings
predating 2026-06-06 cite `events/[id]/page.tsx` line numbers that no longer
resolve, and maps each piece of relocated code to its current home
(`_loaders/load-event-detail.ts` + `event-detail-cache.ts`, the infra
`event-detail/` loaders, `lib/pro.ts`, `application/src/messages/`). The
individual anchors are left in place as the historical record (repointing ~8
links in resolved findings to fresh line numbers just re-stales). New findings
must use current `path#Lstart-Lend` anchors.

**Category:** Documentation hygiene (stale references)
**Where:** the "Files" anchors in the **already-resolved** P1 #0 / P1 #4 / P2 #8
/ P3 #12 findings above.

**Issue:** The 2026-05 findings cite `events/[id]/page.tsx` line numbers
(`#L72`, `#L115`, `#L120`, `#L140`, `#L340`) that no longer point at the cited
code. Since then the event-detail page was decomposed (now 360 LOC), and the
relevant logic moved: the `Date.now()`/`hasStarted` reads are now lifted to
[load-event-detail.ts#L273-L277](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts#L273-L277)
via `renderNowMs()`; the narrowed payment-status selects live in the `_loaders`

- `event-detail-cache.ts`; the infra `getDetail()` was split into
  `event-detail/` loaders (commit `68e80ff1`); and the application `messages.ts`
  was split per-subdomain (architecture audit P3-2). The findings are all ✅
  resolved, so this is purely a navigation hazard for a future reader, not a
  regression.

**Why P3:** Documentation only; the underlying fixes are live.

**Fix:** When these sections are next edited, repoint the anchors to the
loader/cache files (or add a one-line "anchors historical — code relocated by
the 2026-06 decomposition" note). Not worth a standalone edit pass for resolved
findings.

---

## Reevaluation — 2026-05-30

Read-only re-audit against HEAD, graded with the
[audits README rubric](README.md#how-findings-are-graded) (P1 = bug /
data-loss / broken behavior; P2 = important hardening/quality; P3 =
nice-to-have). Scope: the feature surface added since the 2026-05-17 audit
— brackets, leagues, event divisions, ad-hoc + walk-in registrations,
community listings. No profiling; latency/cost notes are static-analysis
estimates.

### What changed since the last audit

The 2026-05-17 → 05-24 backlog is **closed** (ISR shells on the four listing

- three detail pages, event-detail side-load collapse, push/webhook/geocode
  batching, OG cache headers, `isPro` memoization). The new tournament/league
  surface is mostly well-built for performance: index coverage on the hot read
  columns is in place (`bracket_matches_bracket_idx`,
  `bracket_seeds_bracket_idx`, `league_schedule_matches_division_week_idx`,
  `tournament_brackets_division_idx`), the per-week / per-round grouping loops
  are in-memory (not N+1), the `/bracket/watch` page uses Supabase **realtime**
  push rather than polling, and bracket data loads via a single
  `Promise.all([findByDivisionId, listRegisteredTeams])`. Two caching/over-fetch
  gaps stand out, both on the new public **spectator** pages.

---

### P2 #14 — `/events/[id]/bracket` + `/events/[id]/schedule` re-open the `force-dynamic`-on-public-pages regression 🆕 2026-05-30

**Status:** ✅ _Resolved 2026-05-31_ — both pages dropped `force-dynamic` and
the `getViewer()` cookie read; they now load the lightweight viewer-`null`
`getEventBracketMeta` (P3 #15) on the admin client and resolve host/captain
controls client-side, reaching parity with the `/bracket/watch` posture
(viewer-independent, no cookie round-trip). See the
[2026-05-31 remediation log entry](#2026-05-31--bracket--schedule-cacheable-spectator-pages-p2-14--p3-15).
Original finding (for the record):
**Files:**

- [apps/web/src/app/events/[id]/bracket/page.tsx#L16](../../apps/web/src/app/events/%5Bid%5D/bracket/page.tsx#L16) — `export const dynamic = 'force-dynamic'`; `getViewer()` at L32; `getEventDetail(id, user?.id)` (viewer-scoped, uncached) at L37-L40.
- [apps/web/src/app/events/[id]/schedule/page.tsx#L11](../../apps/web/src/app/events/%5Bid%5D/schedule/page.tsx#L11) — same shape.
- Contrast (already correct): [apps/web/src/app/events/[id]/bracket/watch/page.tsx#L32](../../apps/web/src/app/events/%5Bid%5D/bracket/watch/page.tsx#L32) — `getEventDetail(id, null)` (cacheable), no `force-dynamic`, realtime refresher for liveness.

**Issue:** A tournament bracket and a league schedule are inherently public,
viewer-independent spectator content — exactly the workload (one page, many
anonymous viewers refreshing during play) that benefits most from CDN / ISR
caching. But both pages opt out with `force-dynamic` and fetch the
**viewer-scoped** `getEventDetail(id, user?.id)`, which for any signed-in
viewer also skips the `unstable_cache` viewer-`null` read model that Bundle 26
built. Net: every spectator load is a full origin render issuing the
~14-query event-detail read plus the bracket/standings/schedule queries, with
no edge cache in front. During an active tournament this is the highest-fanout
read path in the app and it is entirely uncached.

The pages are `force-dynamic` only because they branch on viewer state
(`event.canManage` → host seeding / record-result / schedule-management
controls). That is the same viewer-conditional-chrome problem Bundle 25
already solved for `/teams/[id]`, `/groups/[id]`, `/players/[id]`.

**Why P2:** Pure caching/cost regression (not broken behavior), but on a
high-fanout public read path. Graded P2 to match the detail-page half of
P1 #1 (the homepage/listing instances were P1; these are narrower-traffic
detail pages).

**Fix:** Apply the Bundle 25 ISR refactor:

1. Render the public bracket/standings/schedule shell from
   `createSupabaseAnonClient()` + `getEventDetail(id, null)` (the cacheable
   path the watch page already uses) and add `export const revalidate = N`
   (drop `force-dynamic`).
2. Lift the host-only controls (seeding, record-result, clear-winner,
   schedule management) into a `'use client'` viewer-chrome component that
   resolves `canManage` client-side, mirroring `<TeamViewerChrome />`.
3. Liveness: the mutating bracket/schedule actions already call
   `revalidatePath` + `updateTag(eventCacheTag(id))`, so tag-based eviction
   keeps spectators current; pair with a short `revalidate` as a backstop.
   Reuse the existing `BracketRealtimeRefresher` for sub-second updates where
   needed.

---

### P3 #15 — Bracket / schedule pages over-fetch via the full `getEventDetail` read model 🆕 2026-05-30

**Status:** ✅ _Resolved 2026-05-31_ — added a lightweight
`EventReadModels.getBracketMeta` projection (2 queries: narrowed `events_view`
row + `event_divisions`) returning only `{ id, title, type, status, timeZone,
hostUserId, hostGroupId, divisions }`. `/bracket`, `/schedule`, **and**
`/bracket/watch` (incl. its `generateMetadata`) now use it instead of the
~14-query `getEventDetail`. See the
[2026-05-31 remediation log entry](#2026-05-31--bracket--schedule-cacheable-spectator-pages-p2-14--p3-15).

**Category:** Over-fetch
**Files:**

- [apps/web/src/app/events/[id]/bracket/page.tsx#L37-L40](../../apps/web/src/app/events/%5Bid%5D/bracket/page.tsx#L37-L40)
- [apps/web/src/app/events/[id]/schedule/page.tsx](../../apps/web/src/app/events/%5Bid%5D/schedule/page.tsx) (`event.type`, `event.divisions`, `event.canManage`, `event.title`, `event.id` are the only fields consumed)

**Issue:** Both pages call `handlers.getEventDetail.execute(...)`, the heavy
read model that side-loads attendees, registered teams, payments, co-hosts,
tip totals, eligible winners, etc. (~14 queries, per P1 #4). The bracket and
schedule pages only need a handful of metadata fields:
`type`, `divisions`, `canManage`, `title`. Everything else is fetched and
discarded on every render.

**Why P3:** Wasted query volume on a hot path, but `getEventDetail(id, null)`
is cacheable (see P2 #14), which softens the cost once that fix lands — hence
P3, not P2. Worth doing as the natural companion to the P2 #14 refactor.

**Fix:** Add a lightweight `GetEventMetaQuery` (or reuse a narrow projection)
returning only `{ id, title, type, status, divisions, canManage }` for the
bracket/schedule/watch pages, instead of the full detail read model. Keep the
viewer-`null` form cacheable so it composes with the P2 #14 ISR shell.

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

### 2026-06-09 — monetization perf re-audit fixes

Landed all four findings (#21–#24) from the 2026-06-08 re-audit. The two with a real
minimal-vs-thorough choice (#22, #23) took the recommended lower-risk path.

| Item                                   | Grade | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #21 sitemap cookie-bound → ISR         | P2    | ✅ Done | [sitemap.ts](../../apps/web/src/app/sitemap.ts): `getServerSupabase()` → `createSupabaseAnonClient()` + `export const revalidate = 3600`. Build now reports `/sitemap.xml` as `○ … 1h` (was dynamic `ƒ`). RLS still filters to public rows for anon. Unbounded `teams` scan left as the documented pagination follow-up.                                                                             |
| #22 club analytics unbounded read      | P3    | ✅ Done | [load-club-dashboard.ts](../../apps/web/src/app/groups/%5Bid%5D/analytics/_loaders/load-club-dashboard.ts): cheap narrow all-time read (3 cols, no join/order, summed directly) + windowed (24mo) detail read; both filter `event_id IN (payout events)` so neither joins `events`. All-time totals stay full-history; page copy notes the table is last-24mo. Dropped dead `months`/`ClubMonthAgg`. |
| #23 event-detail pass/waiver 3rd wave  | P3    | ✅ Done | [events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx): `<Suspense fallback={null}>` around `<PassPanel>` + `<EventWaiverSection>` so their gated reads stream off the critical path. Deeper read-model change deliberately skipped (Suspense already de-criticalizes them).                                                                                                        |
| #24 redundant `force-dynamic` ×5       | P3    | ✅ Done | Dropped the no-op `force-dynamic` from `profile/passes`, `profile/billing/{memberships,passes}`, `groups/[id]/{analytics,billing}`. All five still build as `ƒ` (dynamic via `cookies()`), proving the flag was inert. Deliberate `events/[id]/manage` keep untouched.                                                                                                                               |
| `/profile/billing/analytics` follow-on | P3    | ✅ Done | Consistency pass: gave the long-deferred `/profile/billing/analytics` unbounded read the same narrow-all-time + 24-month-windowed shape as #22 (closes the pagination-sweep deferral). Engagement metrics still read all attendee/division rows (all-time by nature, roster-bounded, not time-unbounded). [analytics/page.tsx](../../apps/web/src/app/profile/billing/analytics/page.tsx)            |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅
(typecheck 15/15; lint 0 errors, 3 pre-existing warnings in untouched files; test
356 web + domain/application; build 8/8). Route-table proof: `/sitemap.xml` flipped
`ƒ` → `○ 1h`; the five #24 pages stayed `ƒ`; `/events/[id]` unchanged `ƒ`. **This
closes every finding from the 2026-06-08 re-audit (1 P2 + 3 P3).**

### 2026-06-07 — P3 #20: historical file-anchors note

Doc-hygiene close-out of the 2026-06-06 re-audit. The `events/[id]/page.tsx`
line anchors in the resolved P1 #0 / P1 #1 / P1 #4 / P2 #8 / P3 #12 findings
went stale when the page decomposed (500-ish → 360 LOC) and its logic moved into
`_loaders/`. Rather than repoint ~8 links in resolved findings to fresh line
numbers (which re-stale on the next refactor), added a single durable
[historical-anchors note](#performance-audit) to the document header mapping each
relocated piece to its current home (event-detail `_loaders/`, the infra
`event-detail/` loaders, `lib/pro.ts`, `application/src/messages/`). The stale
anchors stay in place as the historical record; new findings use current
`path#Lstart-Lend` anchors. No code change. **This closes every finding from the
2026-06-06 re-audit.**

### 2026-06-07 — P3 #17: `/community` listing cacheable + own-hidden recovery

Made the `/community` discovery feed cookie-free (CDN-cacheable per-URL across
anonymous viewers, like `/players`) without regressing the submitter's only
in-app path back to an auto-hidden listing.

| Item                                         | Status   | Notes                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop `cookies()` from the listing render     | ✅ Done  | [page.tsx](../../apps/web/src/app/community/page.tsx) — removed `getCurrentUser()` + `isPlatformAdmin`; `SearchCommunityListingsQuery` now gets `viewerId = null` (the search already ran on the admin-backed handler singleton, so it was the only cookie dependency). Added `export const revalidate = 60`. Route stays `ƒ` (reads `searchParams`) but the response is now shared, not `private`. |
| CTA + admin link → client island             | ✅ Done  | [community-submit-actions.tsx](../../apps/web/src/app/community/_components/community-submit-actions.tsx) — resolves session client-side (`auth.getUser()` + own-profile `is_platform_admin`); defaults to the logged-out CTA (what the cached HTML shows).                                                                                                                                         |
| Preserve own-hidden recovery (no regression) | ✅ Done  | New `CommunityListingRepository.listHiddenBySubmitter` port + impl, a `getMyHiddenCommunityListings` server action, and a `<MyHiddenCommunityListings />` client island (top recovery strip). Replaces the `viewerId`-mixes-in-own-hidden behavior the cacheable list drops. UX change: own-hidden moves inline → a labeled "Your hidden listings" section.                                         |
| Finding correction                           | ⚠️ Noted | The original P3 #17 write-up said "the only viewer-conditional output is the CTA + admin link" — it missed the search's `viewerId`-own-hidden inclusion. The real fix had to preserve that, hence the recovery island.                                                                                                                                                                              |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅
(typecheck 15/15; lint 0 errors, pre-existing warnings only; test 547 domain +
145 application + 262 web; build 8/8).

**Follow-up surfaced — ✅ implemented 2026-06-07:** auto-hide (3 reports →
`hidden`) was a DB trigger with **no notification** to the submitter — the
`/community` recovery strip was the only signal. Now closed: a new
`community.listing.auto_hidden` notification (transactional, email + bell) pings
the submitter when their listing crosses the threshold, deep-linked to
review/unhide. The report handler returns `{ autoHidden }` (detected via a
post-report status re-read) and the report action fires
`notifyListingAutoHidden` only on the transition. See the
[auto-hide notification journal](../journal/2026-06-07-bundle-community-auto-hide-notification.md).
(The recovery strip stays as the in-list affordance; the notification is the
push signal.)

See the [journal](../journal/2026-06-07-bundle-community-listing-isr.md) for the
cookie-vs-searchParams cacheability calibration and the recovery-island decision.

### 2026-06-07 — P2 #16: `/community/[slug]` ISR-cacheable shell

Applied the Bundle 25 (`/teams/[id]` / `/groups/[id]` / `/players/[id]`) ISR
refactor to the new community-listing detail page. The page no longer reads
`cookies()` or `searchParams`, so it leaves the truly-dynamic-`ƒ` (uncached)
state and joins the on-demand-ISR-`ƒ` (cached) state its siblings are in.

| Item                                                | Status   | Notes                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cookie-free / searchParams-free server shell        | ✅ Done  | [page.tsx](../../apps/web/src/app/community/%5Bslug%5D/page.tsx) rewritten: `revalidate = 60`; renders from `loadCommunityDetailPublic`; claimed→301 (admin-client slug resolve) + cookieless `communityListingExists` probe so missing slugs still 404 while hidden/removed fall to the manager island.                                                              |
| Viewer-chrome client island (shared-fetch provider) | ✅ Done  | [community-viewer-chrome.tsx](../../apps/web/src/app/community/%5Bslug%5D/_components/community-viewer-chrome.tsx) — `CommunityViewerProvider` (one `auth.getUser()` + one `getCommunityViewerChrome` server action) feeds `CommunityViewerAlerts` (top) + `CommunityViewerActions` (bottom) via context, preserving the interleaved layout. Anon → no server action. |
| Notice banner → client `useSearchParams` + Suspense | ✅ Done  | [community-notice-banner-client.tsx](../../apps/web/src/app/community/%5Bslug%5D/_components/community-notice-banner-client.tsx); page wraps it in `<Suspense fallback={null}>`.                                                                                                                                                                                      |
| Shared presentational body                          | ✅ Done  | [community-listing-article.tsx](../../apps/web/src/app/community/%5Bslug%5D/_components/community-listing-article.tsx) — no directive, rendered server-side in the public shell and client-side in the manager (`CommunityRestrictedView`) path.                                                                                                                      |
| Server action + loader split                        | ✅ Done  | New [community-viewer-actions.ts](../../apps/web/src/app/community/%5Bslug%5D/community-viewer-actions.ts) (`getCommunityViewerChrome`); `load-community-detail-page.ts` now exports `loadCommunityViewerChrome(slug, user)` (the page-model fn + claimed-redirect/notice/public branches were removed). `community-action-sections.tsx` marked `'use client'`.       |
| Behavior change: hidden/removed non-manager view    | ⚠️ Noted | Was a hard 404; now a 200 "not available" notice (the page can't read the viewer server-side). Genuinely-missing slugs still 404. Hidden/removed are `noindex` → SEO-immaterial; the action enforces the same RLS/status gate (no leak).                                                                                                                              |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅
(typecheck 15/15; lint 0 errors, pre-existing warnings only; test 262 web +
145 application + domain; build 8/8). E2E community claim/report/manage specs not
re-run (now hydration-gated; deploy-gated) — flagged as the remaining manual check.

See the [journal](../journal/2026-06-07-bundle-community-detail-isr.md) for the
`ƒ`-label-vs-actually-cached calibration, the provider-over-server-children
decision, and the soft-404 tradeoff.

### 2026-06-07 — P3 #18 + P3 #19 (redundant force-dynamic / waitlist wave-fold)

The two clean, self-contained wins from the 2026-06-06 re-audit. P2 #16
(community ISR) deliberately sequenced after — it's a multi-piece bundle
(manager-only hidden listings need a viewer read, `searchParams` notice, the
claimed→event 301, interleaved viewer chrome), closer to the deferred
`/events/[id]` shell than a mechanical refactor.

| Item                                  | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3 #18 drop redundant `force-dynamic` | ✅ Done | Removed `export const dynamic = 'force-dynamic'` from [brackets/page.tsx](../../apps/web/src/app/brackets/page.tsx) + [brackets/[id]/page.tsx](../../apps/web/src/app/brackets/%5Bid%5D/page.tsx). Both read `cookies()` unconditionally (`requireRealUser` / `getViewer`), so they stay `ƒ` — the flag was a no-op (same as the resolved P1 #2). Build route table unchanged; the public `/brackets/[id]/watch` was already correctly ISR'd and untouched.                   |
| P3 #19 fold waitlist read into wave 1 | ✅ Done | Extracted `loadWaitlist(event, user)` in [load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts) — internal `open_play && !positionRoster && spotsRemaining === 0` gate, empty-shape fallback, best-effort `catch` — and added it to the wave-1 `Promise.all`. Removes the serial RTT on full open-play event renders; the gate + behavior are identical, so non-full / roster / non-open-play events still issue zero waitlist queries. |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅
(typecheck 15/15; lint 0 errors, 3 pre-existing warnings in untouched files; test
262 web + domain/application; build 8/8).

### 2026-05-31 — Pagination sweep (unbounded UI lists)

Scan for UI list views that render a full result set with no pagination. Each
fix reuses the shared
[`Pagination`](../../apps/web/src/components/pagination.tsx) component + the
established in-memory-slice convention: slice the already-loaded array, render a
paged window, and compute totals / exclude-sets / counts over the **full** set.
Graded P2 where the list grows monotonically over time or per power-user; P3
where bounded in practice.

| Item                                       | Grade | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/profile` Hosting                         | P2    | ✅ Done | `hpage` param, `HOSTED_PER_PAGE = 8`, slices `loadVisibleHostedEvents` output (prolific hosts accumulate many upcoming events). [profile/page.tsx](../../apps/web/src/app/profile/page.tsx)                                                                                                                                                                                                                                                           |
| `/profile/receipts`                        | P2    | ✅ Done | `page` param, `RECEIPTS_PER_PAGE = 20`. Pages the grouped transactions; YTD/all-time totals, CSV-statement years, and the `payment_intent_id` grouping still run over the full ledger. Raw `.range()` rejected — it would split a paid+refund pair across pages. [receipts/page.tsx](../../apps/web/src/app/profile/receipts/page.tsx)                                                                                                                |
| `/profile/billing/earnings`                | P2    | ✅ Done | `page` param, `EVENTS_PER_PAGE = 20`. Pages the all-time "By event" table; YTD monthly breakdown (≤12 rows) and totals untouched. [earnings/page.tsx](../../apps/web/src/app/profile/billing/earnings/page.tsx)                                                                                                                                                                                                                                       |
| `/events/[id]` attendee roster (open-play) | P2    | ✅ Done | `apage` param, `ATTENDEES_PER_PAGE = 30` in [attendees-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/attendees-panel.tsx); unlimited-capacity rosters were unbounded. Hosts still get the whole list via CSV export. Server-side paging kept `AttendeeList` a server component (per-row bound follow / mark-paid actions) — a client "show all" toggle would hit the RSC function-prop pitfall.                                       |
| `/friends` (Following)                     | P2    | ✅ Done | `page` param, `FRIENDS_PER_PAGE = 24`. Slices the display only — the full follow set is retained for `excludeIds` (add-friend picker) + the header count. No domain-port change: `findCardsByIds` is one `in(...)` query, not N+1, and `excludeIds` needs every id anyway. [friends/page.tsx](../../apps/web/src/app/friends/page.tsx)                                                                                                                |
| `/groups/[id]/members` (manage)            | P2    | ✅ Done | `page` param, `MEMBERS_PER_PAGE = 24`. Full list retained for `existingMemberIds` + count. [members/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/members/page.tsx)                                                                                                                                                                                                                                                                                |
| `/profile` Following + Videos              | P3    | ✅ Done | Same file as Hosting: `fpage` / `FOLLOWING_PER_PAGE = 24` (slices `friends`, full set kept for the count) and `vpage` / `VIDEOS_PER_PAGE = 6` (videos are iframe embeds → small page). [profile/page.tsx](../../apps/web/src/app/profile/page.tsx). **Groups left unpaged on purpose** — bounded (self-managed memberships, <10 typical) and `MyGroupsSection` owns its own count display, so paging would change the component contract for no gain. |
| `/messages` inbox cap                      | P3    | 🔴 Open | `get_inbox` RPC hard-caps at `p_limit: 50` with no "load older" — conversations past 50 are unreachable. Real paging needs a migration (offset/cursor + a count fn) + port change. **Deferred 2026-05-31** — not worth a production schema migration for a P3 at current scale. [supabase-messaging-repository.ts](../../packages/infrastructure/src/supabase-messaging-repository.ts)                                                                |
| `/events` + `/community` discovery feeds   | P3    | 🔴 Open | Capped at `limit: 30` / `60` with no page nav; items past the cap are unreachable. Real paging needs offset + total on the search RPCs (migration) **and** a feed-vs-directory product call. **Deferred 2026-05-31** pending that decision.                                                                                                                                                                                                           |
| `/profile/billing/analytics`               | P3    | ✅ Done | Resolved 2026-06-09 with the #22 narrow+windowed shape — all-time GMV headline from a narrow 2-column sum; monthly chart + per-event Net from a 24-month windowed read. Engagement (registrations / repeat-rate / fill-rate) still reads all attendee + division rows (inherently all-time, bounded by the host's roster, not by time). [analytics/page.tsx](../../apps/web/src/app/profile/billing/analytics/page.tsx)                               |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

See [Bundle journal](../journal/2026-05-digest.md#pagination-sweep) for the
in-memory-slice-vs-`.range()` decision, the attendee server-component
constraint, and why the friends fix skipped the domain port.

### 2026-05-31 — Bracket / schedule cacheable spectator pages (P2 #14 + P3 #15)

| Item                                                   | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P3 #15 lightweight `getEventBracketMeta`               | ✅ Done | New `EventReadModels.getBracketMeta(id)` port + `GetEventBracketMetaQuery` / `GetEventBracketMetaHandler`. Infra impl is 2 queries (narrowed `events_view` row + `event_divisions`, reusing `divisionRowToLite(row, null)`) on the admin client. `/bracket`, `/schedule`, `/bracket/watch` (+ its `generateMetadata`) swapped off the ~14-query `getEventDetail`. Handler unit test covers happy path + `NotFoundError`.                                                                                                 |
| P2 #14 drop `force-dynamic` + `getViewer()`            | ✅ Done | Both pages are now thin server shells: static chrome (header / division nav / notice / share) + a client workspace. No `cookies()` read — the singleton repos + `isPro` already run on the service-role admin client, so the page is viewer-independent and matches the `/watch` posture.                                                                                                                                                                                                                                |
| P2 #14 client-resolved host/captain controls           | ✅ Done | New `<BracketWorkspace />` / `<ScheduleWorkspace />` own the viewer-conditional render; shared [`useEventManageCaps`](../../apps/web/src/app/events/%5Bid%5D/_components/use-event-manage-caps.ts) hook resolves `{ viewerId, canManage }` client-side (Bundle 25 `TeamViewerChrome` pattern), replicating the read-model `canManage` (host **or** host-group owner/admin). `BoardView` / `MatchCard` / `MatchRow` unchanged — zero blast radius to standalone brackets. Server-side `assertHost` / RLS gates unchanged. |
| Full-route CDN caching (drop `division` searchParam)   | 🔴 Open | The `division` query param keeps both pages dynamically rendered (`ƒ`), same as `/watch`. Moving division selection client-side to reach full static caching is deferred (would also touch `/watch`).                                                                                                                                                                                                                                                                                                                    |
| `unstable_cache` data layer for bracket/schedule reads | 🔴 Open | The `Bracket` aggregate is a class; `unstable_cache` JSON-serializes its return value (Date/prototype footgun documented in `event-detail-cache.ts`). Deferred — P3 #15 already cuts the dominant query cost.                                                                                                                                                                                                                                                                                                            |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.
E2E (bracket Playwright specs against dev) not yet re-run — flagged as the
remaining manual check.

See [Bundle journal](../journal/2026-05-digest.md#bracket-schedule-cacheable) for
the admin-client cacheability finding, the `canManage`-vs-`is_event_host`
decision, and the searchParams caching constraint.

### 2026-05-22 — Bundle 26: `/events/[id]` viewer-independent cache layer

| Item                                           | Status     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1 #1 `/events/[id]` cacheable shell (partial) | 🟡 Partial | Pragmatic interim: wrapped viewer-independent side-loads in `unstable_cache` keyed by event id, 60 s revalidate, tagged `event:{id}`. Cached helpers added to [load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts): `loadEventReadModelPublic`, `loadEventPricingCached`, `loadEventTipTotalCached`, `loadPrimaryHostSocialCached`, `loadAdHocRowsCached`. Anonymous viewers (SEO crawlers, link clicks, logged-out browsing) hit zero Supabase round-trips on warm cache; signed-in viewers still fetch the viewer-aware read-model copy but skip ~4 side-loads. `generateMetadata` switched to `loadEventReadModelPublic` to avoid duplicating the metadata fetch. |
| Full ISR shell rewrite                         | 🔴 Open    | The full structural refactor (drop `cookies()`/`searchParams` on the page, lift viewer-aware chrome — RSVP / co-host / waitlist / manage / tip flash banners — into client islands) is still deferred. 17 viewer-aware subcomponents + 7 `searchParams` flash-banner reads make this a multi-bundle change. Tracked for a future PPR-enabled pass.                                                                                                                                                                                                                                                                                                                                                           |
| Mutating-action cache eviction                 | 🟡 Partial | 60 s revalidate is the staleness budget — hosts use the uncached signed-in read-model path so they see their own edits immediately, and other viewers tolerate ≤60 s lag. Mutating actions (RSVP, co-host changes, division edits, etc.) do not call `revalidateTag('event:{id}')` in this bundle; if/when staleness becomes a complaint, sprinkling tag invalidations across the 16 action files is a localized follow-up.                                                                                                                                                                                                                                                                                  |

Verified after landing: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ✅.

See [Bundle 26 journal](../journal/2026-05-digest.md#bundle-26) for the
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

See [Bundle 25 journal](../journal/2026-05-digest.md#bundle-25) for the
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

See [Bundle 2 journal](../journal/2026-05-digest.md#bundle-2) for rationale.

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
