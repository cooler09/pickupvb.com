# 2026-05-29 — Bundle: Phase 2b (increment 3) — player profile page behind ProfileQueries

## Context

Continues the P2-1 web-layer DB drain
([architecture audit](../audits/architecture.md#reevaluation--2026-05-29)).
Increments [1](2026-05-29-bundle-phase-2b-profile-queries-foundation.md) and
[2](2026-05-29-bundle-phase-2b-inc2-players-directory.md) drained `searchPeople`
and the players directory. This increment finishes the **player profile page**
(`/players/[handle]`), the cluster's rich-shape read.

## Decisions

- **Two by-handle reads, two methods.** The page does a heavyweight read (16
  columns: positions, social handles, hero image, pro-badge) for the body and
  a lightweight read (name + city) in `generateMetadata`. Modeled as
  `findPlayerByHandle` → `PlayerProfile` and `findCardByHandle` → `ProfileCard`
  (reusing the card projection), so metadata stays cheap.
- **camelCase `PlayerProfile` read model at the boundary.** The page consumed
  ~16 `profile.snake_case` fields straight from the DB row (the P2-1 smell). The
  domain `PlayerProfile` is camelCase; the page's local `PlayerProfile` row type
  is deleted, and every JSX access + the `nameOf`/`initialsOf` helpers now use
  camelCase. The adapter owns the snake→camel mapping (`toPlayer`).
- **`opengraph-image.tsx` deliberately left raw — and a latent bug flagged.**
  It reads `profiles_public` with `.eq('id', params.id)`, but `params.id` is the
  **handle** (the page uses `.eq('handle', params.id)`), so the OG lookup never
  matches and always renders the `'Player'`/`'PickupVB'` fallback. Migrating it
  to `findCardByHandle` would silently _fix_ that bug inside a structural
  refactor — wrong place for a behaviour change. Left as-is; tracked as a
  follow-up to fix intentionally.
- **`player-viewer-actions.tsx` out of scope.** It's a `'use client'` island
  reading the viewer's `friendships` via the **browser** client — not a server
  read, so it can't use the infra adapter. Belongs to a later (client-read)
  approach, not `ProfileQueries`.
- **Long `select` string defeats supabase-js type inference.** The 16-column
  `PLAYER_COLUMNS` makes the client return `GenericStringError` at the type
  level, so `toPlayer` casts via `data as unknown as PlayerRow` (the documented
  escape for this in the codebase).

## Changes

Domain:

- `users/profile-queries.ts` — added `PlayerProfile` read model +
  `findCardByHandle` / `findPlayerByHandle` to the port.

Infrastructure:

- `supabase-profile-repository.ts` — `PLAYER_COLUMNS` + `PlayerRow` + `toPlayer`
  mapper; implemented both by-handle reads against `profiles_public`.

Web:

- `app/players/[id]/page.tsx` — `generateMetadata` → `findCardByHandle`; the
  page → `findPlayerByHandle`; deleted the local `PlayerProfile` row type;
  helpers + JSX now consume camelCase. `supabase` (anon) is kept only for
  `loadVisibleHostedEvents`. No raw `profiles` query remains in the file.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(309 tests; lint 0 errors). No DB change.

## Follow-ups

- **OG image id/handle bug** ([opengraph-image.tsx](../../apps/web/src/app/players/%5Bid%5D/opengraph-image.tsx)):
  fix `.eq('id', …)` → handle lookup (via `findCardByHandle`) as its own change
  with intent — player OG cards currently show no name/city.
- **`profiles_public` reads elsewhere** (community/teams/groups pages, event
  loaders) and the `friendships` reads, then the `profiles` _writes_
  (→ `UserProfile` aggregate). `GroupRepository` + notification outbox still
  untouched.
- **Vitest for `escapeLike`** now that three methods share the adapter helpers.
