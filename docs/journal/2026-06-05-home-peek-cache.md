# Cache the homepage peek reads (H-9) (2026-06-05)

## Context

Closes **H-9** in [home-page-ux.md](../audits/home-page-ux.md). The landing page
(`/`) is the highest-traffic public surface, and it renders **dynamically** — it
reads `cookies()` via `getCurrentUser()` to branch the guest vs. authed UI. That
itself is fine (and not `force-dynamic` abuse — the page never sets it). The
waste was that on **every** request — most of them anonymous visitors and
crawlers — it re-ran two Supabase round-trips for the "fresh content" peek:

1. `handlers.searchEvents` (the upcoming-events grid), and
2. `SupabaseGroupQueryRepository.listCards(6)` (the groups grid).

Both results are **viewer-independent**:

- `search_events` takes **no viewer argument** — the `SearchEventsQuery.viewerId`
  is dropped before the RPC call ([supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts)),
  so it returns the same public, upcoming events for everyone, signed in or not.
- `listCards` is the public groups-directory slice.

So the same data was fetched fresh for every anonymous hit.

## Decisions

- **Cache the data reads, not the route.** Keep the page dynamic (it genuinely
  needs `cookies()` for the UI branch) and wrap just the two peek reads in a
  single module-scope `loadHomePeek` `unstable_cache`. Every dynamic render now
  shares one cached payload instead of hitting the DB twice. This mirrors the
  event-detail consolidation
  ([event-detail-cache.ts](../../apps/web/src/app/events/[id]/_loaders/event-detail-cache.ts)),
  which caches viewer-independent side-loads while the page stays dynamic.
- **Admin client inside the callback — mandatory and safe.** Next 16 forbids
  `cookies()` inside `unstable_cache`, so the callback cannot use
  `getServerSupabase()`. `searchEvents`'s repo already self-builds the admin
  (service-role) client, and the groups repo is now handed `getAdminSupabase()`.
  The service-role read is safe here precisely because the data is public: the
  search RPC only emits public events, and the groups directory is public
  (`deleted_at is null`). This is the sanctioned admin-in-cache pattern from the
  event-detail loaders, not an RLS-bypass on protected data (pitfall #8 doesn't
  apply — there's no per-viewer authorization to enforce).
- **Time-based eviction (60s revalidate), not tags.** The peek is a
  **denormalized cross-entity list**, so the per-entity `eventCacheTag(id)`
  builders don't fit `unstable_cache`'s _static_ tag model (you can't tag the
  entry with ids computed from the result). Threading a brand-new
  `home-peek` tag through every event/group mutator would be a large surface for
  a non-critical marketing peek, and the `/events` listing it mirrors isn't
  tag-cached either. 60s staleness on a new/edited event is fine here, and 60s
  matches the sibling event-detail cache cadence. Introducing a tag that no
  mutator emits would be a misleading partial pattern (playbook item 4), so I
  deliberately didn't.
- **No `Date` revival.** `unstable_cache` JSON-serializes, so
  `VolleyballEventSummary.startsAt` comes back as an ISO string on a cache hit —
  the same gotcha that forced `reviveEventDetailDates` in the event-detail cache.
  But here both consumers already accept `Date | string`: `relativeEventDay`
  normalizes with `d instanceof Date ? d : new Date(d)`, and `EventCard` does the
  same for `startsAt`. So no revival is needed, and I noted that in the loader
  comment so the next reader doesn't add one defensively (or remove the
  tolerance from the consumers).
- **Dropped `getServerSupabase()` from the page.** It was only used to build the
  groups repo for `listCards`; that now lives in the cached callback on the admin
  client, so the page no longer constructs a session client at all.

## Verification

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all green (only the
pre-existing `set-state-in-effect` warnings in unrelated files). The root route
still builds as dynamic (`ƒ`), as intended. No new test: this is a caching
wrapper over two already-covered reads with no new branching logic; the
behavior-preserving claim is that the reads are viewer-independent, which is a
property of the `search_events` RPC signature (no viewer arg) rather than
something a unit test on the page would pin.

## Files

- [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx) — `loadHomePeek`
  `unstable_cache`; removed `getServerSupabase` import/use; component now awaits
  the cached loader and keeps a live `now` only for the relative-day labels.

## Follow-ups

- **H-2 / H-3 / H-6** remain open from the prior passes.
- If the homepage peek ever needs read-your-own-writes (e.g. a host expecting a
  just-created event to appear instantly), revisit: either drop `revalidate` and
  add a real `home-peek` tag wired through the event/group create+publish
  mutators, or migrate to the `'use cache'` + `cacheTag()` model where dynamic
  per-id tagging from the result is possible.
