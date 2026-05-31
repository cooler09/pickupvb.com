# Bracket / schedule cacheable spectator pages (2026-05-31)

## Context

The 2026-05-30 performance re-audit opened two items on the public tournament/
league spectator pages ([docs/audits/performance.md](../audits/performance.md)):

- **P2 #14** — `/events/[id]/bracket` and `/events/[id]/schedule` set
  `export const dynamic = 'force-dynamic'` and called the viewer-scoped
  `getEventDetail`, re-opening the P1 #1 "force-dynamic on public pages"
  regression on what is the highest-fanout read path during a live tournament.
  The public event page links **everyone** (incl. anonymous spectators) to
  `/bracket` and `/schedule`, so these are genuinely spectator-hit, not
  host-only.
- **P3 #15** — both pages (and `/bracket/watch`) called the ~14-query
  `getEventDetail` read model but consumed only `type / divisions / title /
hostUserId / timeZone`.

The `/bracket/watch` page was cited as the correct reference posture (no
`force-dynamic`, viewer-`null` reads). Goal: bring `/bracket` + `/schedule` to
that same posture while preserving the host/captain editing UX exactly.

## Decisions

- **Resolve viewer capabilities client-side, not server-side.** The blocker was
  that `force-dynamic` + `getViewer()` (cookies) forced a per-viewer dynamic
  render. Chose the Bundle 25 `TeamViewerChrome` pattern — a `'use client'`
  workspace that resolves `{ viewerId, canManage }` via
  `createSupabaseBrowserClient().auth.getUser()` after hydration — over a
  server-side split, so the page itself reads no cookies.
- **Replicate `canManage`, not `is_event_host`.** These are different sets:
  the read-model `canManage` = primary host **or** owner/admin of the _host
  group_; the `is_event_host` RPC = host / co-host users / co-host groups.
  Chose to replicate `canManage` (host compare + a self-scoped `group_members`
  read) so the same users see the same controls as before. The pre-existing
  `canManage`-vs-`assertHost`/`is_event_host` mismatch was left untouched
  (out of scope).
- **Keep `BoardView` / `MatchCard` / `MatchRow` prop-driven and unchanged.**
  The new workspaces wrap them and pass resolved `isHost` / `viewerId`. Chose
  this over converting those components to read a context, which would have
  rippled into the standalone `/brackets/[id]` page (actively under
  development) — this way the blast radius is zero. Captain editing still works
  because `MatchCard` compares `viewerId` to the `captainId`s already in the
  team data.
- **No `unstable_cache` for the bracket/schedule reads.** `findByDivisionId`
  returns the `Bracket` _aggregate_ (a class); `unstable_cache` JSON-serializes
  its return value (the Date/prototype footgun already documented in
  `event-detail-cache.ts`). The dominant query-cost win comes from P3 #15
  (~14 → ~2 queries) instead.
- **No new `revalidate`.** The pages match `/watch` exactly (no `force-dynamic`,
  no `revalidate`); freshness rides the existing `updateTag(eventCacheTag(id))`
  - `revalidatePath` in the mutating actions and the `BracketRealtimeRefresher`.

## Changes

- **domain** — `EventBracketMetaReadModel` type + `EventReadModels.getBracketMeta`
  port method ([event-repository.ts](../../packages/domain/src/events/event-repository.ts)).
- **infrastructure** — `SupabaseEventRepository.getBracketMeta` (2 queries on
  the admin client, reuses `divisionRowToLite(row, null)`)
  ([supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts)).
- **application** — `GetEventBracketMetaQuery` + `GetEventBracketMetaHandler`
  ([messages.ts](../../packages/application/src/messages.ts),
  [event-detail.handler.ts](../../packages/application/src/queries/event-detail.handler.ts));
  handler unit test (happy path + `NotFoundError`).
- **web** — wired `handlers.getEventBracketMeta`
  ([handlers.ts](../../apps/web/src/lib/handlers.ts)); shared
  [`useEventManageCaps`](../../apps/web/src/app/events/%5Bid%5D/_components/use-event-manage-caps.ts)
  hook; new `BracketWorkspace` + `ScheduleWorkspace` client islands;
  `bracket/page.tsx` + `schedule/page.tsx` rewritten as thin viewer-independent
  shells (dropped `force-dynamic` + `getViewer`); `bracket/watch/page.tsx`
  (+ `generateMetadata`) swapped to the meta query.
- **docs** — performance audit status update + remediation log + README index row.

## Patterns observed

- **The module-singleton repos run on the service-role admin client** (no
  `client` arg in `handlers.ts`). So `getEventDetail` / `getBracketMeta` /
  `bracketRepo.*` reads never call `cookies()`, and `isPro` is admin-backed too.
  The only things that make a bracket/schedule render _viewer-dependent_ are
  `force-dynamic` and `getViewer()` — not the data reads. Worth remembering
  before assuming a page "needs" a cookie-bound client.
- **`searchParams` keeps a route dynamic (`ƒ`) regardless of cookies.** Reaching
  `/watch` parity (cheap, viewer-independent render) is achievable; full static
  CDN caching is not, until `division` moves off the query string.

## Follow-ups

- Move `division` selection off `searchParams` to unlock full static CDN
  caching (would also touch `/watch`). Tracked in performance.md P2 #14.
- `unstable_cache` data layer for the bracket/schedule reads if warm-cache
  Supabase skips become worth the aggregate-serialization plumbing. Tracked in
  performance.md P2 #14.
- **Re-run the bracket Playwright e2e specs against dev** (Node 22) before
  considering this fully closed — authoring ≠ running (AGENTS.md). The verify
  chain (typecheck/lint/test/build) is green but the click-path hasn't been
  exercised post-refactor.
