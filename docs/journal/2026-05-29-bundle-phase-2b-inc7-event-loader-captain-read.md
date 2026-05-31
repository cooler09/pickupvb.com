# 2026-05-29 — Bundle: Phase 2b (increment 7) — event-loader captain read behind ProfileQueries

Small, bounded drain of the previously-deferred `load-event-detail.ts` reads.

## What changed

`loadAdHocPublicRowsCached` (the `unstable_cache` ad-hoc/walk-in loader) read
`admin.from('profiles_public').select('id, display_name').in('id', captainIds)`
to resolve captain names. Routed it through
`new SupabaseProfileRepository(admin).findCardsByIds(captainIds)` (kept in the
existing `Promise.all` with the members read), dropped the manual
`captainMap` loop, and read `captainCards.get(id)?.displayName` downstream.

## Decisions

- **The port works inside `unstable_cache` with the admin client.** The cache
  callback obtains `admin = getAdminSupabase()` via dynamic import (the
  documented "no cookies inside unstable_cache" pattern); `findCardsByIds` is a
  plain read with no cookie access, so passing `admin` is safe. This was the
  reason this loader's reads were deferred — now confirmed clean.
- **Over-fetch is harmless here.** `findCardsByIds` selects the 5 card columns
  vs. the old `id, display_name`; the cache stores only the derived
  `AdHocRegPublicRow[]` (which keeps `captainDisplayName`), so the extra columns
  don't bloat the cached payload.
- **L705 host-social-handles read deferred.** `loadPrimaryHostSocialFresh`
  reads a _different_ shape (`SocialHandles`: instagram/tiktok/…/website) by id;
  it doesn't fit the card ports, and inventing a domain social-handles read
  model for one caller isn't worth it yet. Left raw, tracked.

## Changes

- Web: `events/[id]/_loaders/load-event-detail.ts` — captain read →
  `ProfileQueries.findCardsByIds` (admin client, inside the cache callback);
  removed the `captainMap` build loop.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(313 tests; lint 0 errors). No DB change.

## Follow-ups (rest of Phase 2b, P2-1)

- **`load-event-detail.ts` L705 host social handles** — distinct shape; migrate
  when/if a domain social-handles read model is warranted.
- **The `friendships`/`profiles` writes** (friend add/remove, profile edit,
  theme, hero, business-info) → expand the orphan `UserProfile` aggregate +
  wire `UserRepository`. This is the next _substantive_ P2-1 piece and is a step
  up in size/risk (the aggregate is anemic vs. the real profile shape) — best
  opened with a short ADR.
- `GroupRepository` (Phase 3, ~28 raw hits) + the notification outbox — still
  untouched, each a sizable bundle.
