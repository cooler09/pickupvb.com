# 2026-05-29 — Bundle: Phase 2b (increment 2) — players directory behind ProfileQueries

## Context

Continues the P2-1 web-layer DB drain
([architecture audit](../audits/architecture.md#reevaluation--2026-05-29)).
[Increment 1](2026-05-29-bundle-phase-2b-profile-queries-foundation.md) stood
up the `ProfileQueries` read port + adapter and migrated `searchPeople`. This
increment grows the port and fully drains the **players directory**
(`/players`), the largest clean `profiles_public` read site.

## Decisions

- **`searchDirectory` is a distinct method, not an overloaded `searchCards`.**
  The directory needs name + city filters, name ordering, exact count, and
  offset pagination, and returns `{ cards, total }`; the picker (`searchCards`)
  wants none of that. Two clear methods beat one with five optional knobs and a
  union return.
- **camelCase at the page boundary (per AGENTS.md).** The page consumed
  `p.display_name` / `p.home_city` / `p.avatar_url` directly — DB shape leaking
  into JSX, the exact P2-1 smell. The port returns `ProfileCard` (camelCase),
  so the page now consumes `displayName` / `homeCity` / `avatarUrl`. The
  `nameOf` / `initialsOf` helpers retype from a local `Row` to the shared
  `ProfileCard`, and the local `Row` type is deleted.
- **Anon client still injected.** `/players` is an ISR-cached anonymous page;
  it keeps building the repo with `createSupabaseAnonClient()`, so the read
  stays sessionless/cacheable — the client-injection design from increment 1
  pays off (no admin escalation).
- **Scoped to the directory; the `players/[id]` profile page is increment 3.**
  That page's read is a 15-column rich shape (positions, social handles, hero
  image, pro badge) feeding ~20 JSX field accesses — a `PlayerProfile` read
  model + that JSX churn is its own focused unit, kept separate to bound risk.

## Changes

Domain:

- `users/profile-queries.ts` — added `searchDirectory(ProfileDirectoryQuery):
Promise<ProfileDirectoryPage>` + the `ProfileDirectoryQuery` /
  `ProfileDirectoryPage` types.

Infrastructure:

- `supabase-profile-repository.ts` — implemented `searchDirectory` (reuses
  `CARD_COLUMNS` + `escapeLike` + `toCard`; `count: 'exact'`, name order, range
  pagination, name/city ilike).

Web:

- `app/players/page.tsx` — replaced the inline `profiles_public` query (select +
  count + range + two inline LIKE-escapes) with
  `new SupabaseProfileRepository(createSupabaseAnonClient()).searchDirectory(...)`;
  deleted the local `Row` type; helpers + JSX now consume camelCase
  `ProfileCard`. File no longer issues a raw `supabase.from(...)`.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(309 tests; lint 0 errors). No DB change.

## Follow-ups (rest of Phase 2b)

- **Increment 3 — `players/[id]` profile page.** Add a `PlayerProfile` read
  model + `findPlayerByHandle` (rich shape) and `findCardByHandle` (the
  lightweight `generateMetadata` read), then migrate both reads in that file +
  the camelCase JSX. `opengraph-image.tsx` + `player-viewer-actions.tsx` are in
  the same cluster.
- **Then** attendee/member batch reads (`findCardsByIds`), the `friendships`
  reads, and finally the `profiles` _writes_ (→ `UserProfile` aggregate).
- **Add a Vitest** for `escapeLike` now that two methods share it.
