# 2026-05-29 — Bundle: Phase 2b (increment 1) — ProfileQueries read port + first migration

## Context

Start of Phase 2b from the
[architecture re-audit](../audits/architecture.md#reevaluation--2026-05-29) —
the **P2-1** web-layer DB leakage. A survey found **42 raw query occurrences**
across ~32 files (`profiles` ×21, `profiles_public` ×16, `friendships` ×5),
and they're **heterogeneous**: three different clients (anon directory pages,
the viewer's session, admin), two lookup keys (`id` vs `handle`), card-vs-full
shapes, and the privacy-sensitive `profiles` (PII) vs `profiles_public` (safe
view) split. That heterogeneity is why P2-1 is a multi-increment effort, not a
one-shot drain.

This bundle lays the **foundation** — a `ProfileQueries` read port + adapter,
mirroring the Phase 2a `SocialGraphQueries` shape — and migrates the cleanest,
self-contained site (`searchPeople`) to prove it. Subsequent increments grow
the port and drain more sites against this seam.

## Decisions

- **Foundation + one safe migration over a rushed bulk drain.** Given the
  privacy sensitivity (querying `profiles` vs `profiles_public`) and the client
  heterogeneity, migrating all 42 sites in one pass is high-risk. Started with
  the port + the single audit-named site (`searchPeople`) whose public return
  type is unchanged → zero call-site churn outside the action.
- **The adapter takes the caller's client; no admin default.** Unlike the
  module-singleton repos, `SupabaseProfileRepository` _requires_ a client in
  its constructor, so public-profile reads keep running under whatever auth
  context the call site already had (anon page, viewer session). This avoids
  silently escalating a profile read to the service-role admin client — which
  matters because profiles carry PII (the adapter reads the safe
  `profiles_public` view either way, but the principle keeps later migrations
  honest).
- **LIKE-escaping moves into the adapter.** The `value.replace(/[%_]/g, …)`
  dance was duplicated at every search site; it now lives once in
  `escapeLike`, and callers pass raw user text via `nameLike`.
- **Keep the port minimal (YAGNI).** Only `searchCards({ nameLike, limit })` —
  exactly what `searchPeople` needs. `findCardById` / `findCardByHandle` /
  pagination+count (for the players directory) get added when their first
  caller is migrated, not speculatively.
- **Preserved `searchPeople`'s graceful-degrade.** The original swallowed DB
  errors (`if (error) return []`); the adapter throws (correct port behaviour),
  so the action wraps the call in try/catch → `[]` to keep identical
  user-facing behaviour.

## Changes

Domain:

- `users/profile-queries.ts` (new) — `ProfileQueries` port, `ProfileCard`
  projection (`id, handle, displayName, homeCity, avatarUrl`),
  `ProfileSearchQuery`. Exported via `users/index.ts`.

Infrastructure:

- `supabase-profile-repository.ts` (new) — `SupabaseProfileRepository`
  implements the port; reads `profiles_public`; owns `escapeLike` + the
  `CARD_COLUMNS` projection + row→card mapping. Constructor requires a client.
  Exported from the infra barrel.

Web:

- `app/people-actions.ts` — `searchPeople` now builds
  `new SupabaseProfileRepository(await getServerSupabase())` and calls
  `searchCards`; dropped the inline `profiles_public` select, the local `Row`
  type, and the inline LIKE-escape. `PeopleSearchResult` (the public contract,
  consumed by `user-picker.tsx`) is unchanged.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(309 tests; lint 0 errors). No DB change.

## Patterns observed

- **Drain the most-duplicated _logic_, not just the query.** The real DRY win
  wasn't the `select` string — it was the LIKE-escape + row-mapping repeated at
  every search/card site. Homing those in the adapter is what makes the next
  migrations one-liners.
- **A required-client adapter is the right shape for viewer-scoped reads.**
  The module-singleton + admin-client pattern is wrong for PII reads; injecting
  the call site's client preserves RLS and forces the caller to be explicit.

## Follow-ups (rest of Phase 2b, P2-1)

- **Grow `ProfileQueries` + drain the remaining ~40 sites**, by cluster:
  players directory/profile reads (anon client, lookup by `handle`, needs
  `searchCards` with city+count+pagination and a `findCardByHandle` / rich
  profile projection); attendee/member/roster batch reads (`findCardsByIds`);
  the `friendships` reads (some overlap with `lib/mappers/friend.ts`).
- **`profiles` _writes_** (profile edit, theme, hero image, business info) are a
  separate, riskier increment — they belong on the `UserProfile` aggregate /
  `UserRepository` (currently declared but unimplemented), and the aggregate is
  anemic vs. the real profile shape, so it needs expanding first.
- **Add a Vitest unit** for `searchCards` LIKE-escaping once a second caller
  exists (the escape logic is now centralized and worth pinning).
