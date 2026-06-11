# Public profile substance + hero banner — PUB-7 / PUB-8 (2026-06-10)

## Context

Re-audit of the public player profile (`/players/[id]`,
[public-profile-ux.md](../audits/public-profile-ux.md)) after the 2026-06-08
first pass closed PUB-1…6. The re-audit opened six new findings (no P1); this
bundle ships the headline two, which the user picked as a pair:

- **PUB-7 (P2)** — most players never host, so for the dominant persona the
  whole page was identity card → usually-empty badge shelf → nothing. A thin,
  dead-end card. (This was the follow-up explicitly deferred from PUB-1.)
- **PUB-8 (P3)** — a profile **hero-banner** path was wired end-to-end in the
  backend (`saveHeroImageUrl('profiles', …)` → `SetProfileHeroImageHandler` →
  aggregate `setHeroImage` → `SupabaseUserRepository` writes `hero_image_url`;
  `profiles_public.hero_image_url` exposed; orphan-sweep `profiles` branch
  present) but had **no UI to set or render it**. Events and groups both show a
  banner, so the intent was clearly profile banners too — scaffolded and
  abandoned. The user chose **complete it**, not remove it.

## Decisions

- **PUB-8 needed zero backend.** The surprise on opening it: the write path and
  the `purge_hero_image_orphans` liveness branch for `entity_type = 'profiles'`
  (with the `?t=` cache-buster guard, since
  [20260819000000](../../supabase/migrations/20260819000000_fix_hero_image_orphan_cache_buster.sql))
  were already correct. So this was a pure app-layer wire-up — **no migration,
  no new command/handler.** Only two ends were missing: a `HeroImagePanel
entityType="profiles"` next to `AvatarPanel` in the editor (`entityId ===
userId`), and `hero_image_url` selected into `PLAYER_COLUMNS` + a
  `<HeroImage>` band atop the public page. `hero_image_url` was also threaded
  through `load-profile-page.ts` so the editor panel shows the current banner.

- **Banner is opt-in, not default-art.** `HeroImage` falls back to branded court
  art when `url` is null — right for events/groups (venue-like), wrong to force
  on every _person's_ card. So the band renders only when
  `profile.heroImageUrl` is set; an idle profile stays clean. This keeps the
  visual change scoped to players who deliberately upload one.

- **PUB-7 reuses the canonical cards, doesn't reinvent them.** New co-located
  [\_components/plays-with.tsx](../../apps/web/src/app/players/[id]/_components/plays-with.tsx)
  follows the `hosted-events-list.tsx` shape (loader + presentational view in
  one file). It renders `GroupCard` and `TeamCard` — the latter already had a
  `role="public"` variant (no badge), so no card work was needed — driven by the
  existing `SupabaseGroupQueryRepository.listMembershipsForUser` plus a direct
  `team_members → teams!inner` read filtered to `status = 'active'` and
  `deleted_at IS NULL`. Each sub-section self-hides when empty; the block
  returns `null` when the player has neither, so no hollow placeholders.

- **Anon-safe, stays ISR.** All four membership tables select under RLS
  `using (true)`, so `loadPlaysWith` runs on the page's sessionless anon client
  and adds two reads to the existing `Promise.all` without pulling `cookies()`
  in — the route keeps `revalidate = 60`.

- **Member-since is a pure string slice.** `created_at` (ISO) → year via
  `createdAt.slice(0, 4)`, not `new Date(...).getFullYear()`, to avoid an impure
  read in render (React Compiler purity, AGENTS pattern #4).

## Alternatives rejected

- **Remove the hero path (PUB-8 option 2).** Cheaper, but the backend was
  already complete and events/groups set the precedent — deleting working
  infra to "tidy" a half-feature would have thrown away the 90% that was done.
- **A dedicated `loadPublicMemberships` that re-reads groups with a
  `deleted_at` filter.** Reusing `listMembershipsForUser` keeps parity with the
  owner hub (same method, same data) at the cost of not filtering soft-deleted
  groups — an edge case the hub already tolerates. Parity won.
- **A `bio` blurb.** No `bio`/`tagline` column exists on `profiles` at all, so
  it's a real schema + editor + moderation increment, not a same-bundle relabel.
  Deferred inside PUB-7.

## Follow-on same day (PUB-9 + PUB-10)

Two quick P3s in the same identity card, shipped right after the headline pair
(quad-green):

- **PUB-9 ✅** — avatar `width/height` 72 → 80 to match the rendered `h-20 w-20`
  (80px) box, so Next's optimizer/srcset serves the right resolution instead of
  upscaling a 72px intrinsic. Matches the private hub's value.
- **PUB-10 ✅** — the public card now omits the home-city line when unset rather
  than echoing "No home city set" (owner-instruction copy) to a stranger
  viewing someone else's profile.

## Follow-on same day (PUB-11 Block + PUB-12)

- **PUB-11 ◑** — added a `⋯` overflow menu (Radix `DropdownMenu`, the
  `event-actions-menu.tsx` pattern) with **Block / Unblock**, reusing the
  existing `blockUser` / `unblockUser` chat actions. The hydration effect reads
  `user_blocks` (owner-scoped RLS) next to `friendships` to seed the toggle;
  optimistic + toast on failure; the **Message** button hides when blocked
  (a blocked pair can't DM — RLS `is_blocked_pair`). **Report deferred:** unlike
  Block it's _not_ an entry point — there's no profile-report table, command, or
  admin queue (reports today are per-content only), so a real "Report player"
  needs new backend disproportionate to a P3. The user chose Block-now /
  Report-later.
- **PUB-12 ✅** — `getPlayerByHandle` (`React.cache`,
  [\_loaders/load-player.ts](../../apps/web/src/app/players/[id]/_loaders/load-player.ts))
  is now shared by `generateMetadata` + the page, so a cache-MISS render fires
  one `profiles_public` query instead of two. Needed `discoverable` on
  `PlayerProfile` / `PLAYER_COLUMNS` so metadata reads the noindex flag off the
  shared row rather than its own `findCardByHandle`. The OG route is a separate
  render and keeps its independent read.

## Follow-ups (still open on this surface)

- **PUB-11 Report half (P3)** — a "Report player" entry point needs a
  `profile_reports` table + `ReportProfileCommand`/handler + an admin review
  surface; deferred until there's somewhere to consume the reports.
- **e2e** — the new membership block, banner, and block menu aren't covered by
  Playwright; the real "does it render / does block take" check is deploy-gated
  (not authored red, per the repo's unrun-spec warning).

Verified `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all green
(375 tests, 0 lint errors). Working tree left dirty for the maintainer to
review and commit.
