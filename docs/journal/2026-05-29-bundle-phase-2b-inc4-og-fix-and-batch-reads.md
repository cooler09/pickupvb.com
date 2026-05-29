# 2026-05-29 — Bundle: Phase 2b (increment 4) — OG image fix + findCardsByIds batch drain

Two related changes requested together; each is independently committable.

## Part 1 — fix the player OG image (the latent id/handle bug)

`players/[id]/opengraph-image.tsx` read `profiles_public` with
`.eq('id', params.id)`, but the `/players/[id]` segment is the **handle** (the
page itself looks up by handle). So the OG lookup never matched and every
player share-card fell back to the generic `'Player'` / `'PickupVB'`.

Routed it through `ProfileQueries.findCardByHandle(params.id)` — which both
drains the raw query and **fixes the bug** (cards now resolve the real
name/city). This was flagged as a side-finding in inc. 3 and deliberately
left out of that structural refactor; doing it here as an explicit,
intentional behaviour fix (with a comment explaining the old miss).

## Part 2 — `findCardsByIds` + the batch-read cluster

Added `findCardsByIds(ids): Promise<Map<string, ProfileCard>>` to the port +
adapter (empty-array fast path; keyed by id for O(1) lookup), and drained the
four sites that resolved a set of user ids to profile cards via an inline
`profiles_public` `.in('id', …)` + manual `Map` build:

- `teams/page.tsx` (captain names) — `Map<id,string>` consumer became
  `captainCards.get(id)?.displayName`.
- `teams/[id]/page.tsx` (roster) and `groups/[id]/members/page.tsx` /
  `groups/[id]/page.tsx` (member lists) — each had a single contained
  `profile: { … }` literal, so the only downstream churn was snake→camel on
  the mapped fields (`display_name`→`displayName`, `avatar_url`→`avatarUrl`).

Each site dropped its local `ProfilePublicRow` type and its `if (ids.length)`
guard (the port handles empty). Clients are preserved per site (anon for the
public team/group pages, `getServerSupabase()` for the members admin page) —
the required-client adapter keeps RLS context intact.

## Decisions

- **Derive, don't re-shape, for the name-only consumer.** `teams/page.tsx`
  only needed names; rather than keep a `Map<id,string>`, the call site now
  reads `card.displayName` off the card map — one-line change, no helper.
- **OG fix carries a comment, not a silent change.** Behaviour changes in a
  refactor get an explicit note so the next reader knows it was intentional.

## Changes

- Domain: `users/profile-queries.ts` — `findCardsByIds` on the port.
- Infra: `supabase-profile-repository.ts` — `findCardsByIds` impl.
- Web: `players/[id]/opengraph-image.tsx` (OG fix), `teams/page.tsx`,
  `teams/[id]/page.tsx`, `groups/[id]/members/page.tsx`, `groups/[id]/page.tsx`
  (batch reads → port; local `ProfilePublicRow` types removed; camelCase at the
  boundary).

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(309 tests; lint 0 errors). No DB change.

## Follow-ups

- **Remaining `profiles_public` reads**: event loaders + community page + the
  receipts CSV (full-PII `profiles`, not a card — separate shape). Then the
  `friendships` reads and the `profiles` _writes_ (→ `UserProfile` aggregate).
- **Vitest for `escapeLike`**: now shared by `searchCards` / `searchDirectory`;
  worth pinning (needs either exporting it or a mocked client). Still open.
