# 2026-05-29 — Bundle: Phase 2b (increment 6) — friend-edges read behind SocialGraphQueries

Continues the P2-1 drain into the `friendships` reads.

## What changed

The friends list + mutual-friend detection lived in `lib/mappers/friend.ts`
(`loadFriendEdges`, the Bundle-64 mapper-extraction win) — a web-layer helper
still issuing raw `friendships` + `profiles_public` queries and **duplicating
the profile-card read**. Moved it onto the existing `SocialGraphQueries` port as
`getFriendEdges(viewerId): Promise<FriendEdges>` (`{ friends: ProfileCard[];
mutualIds: Set<string> }`), implemented in `SupabaseSocialGraphRepository`, and
deleted the mapper. `profile/page` + `friends/page` now call the port; the
shared `FriendsList` component consumes camelCase `ProfileCard`.

## Decisions

- **Compose, don't duplicate (cross-port reuse).** `getFriendEdges` reads only
  the friendship _edges_ itself, then resolves the friend **cards** through
  `ProfileQueries.findCardsByIds` — the social adapter lazily builds a
  `SupabaseProfileRepository` on the same client. So the `profiles_public` card
  projection stays owned in one place (the profile adapter); the social graph
  owns the edges. This is the first adapter-composes-adapter seam and the right
  shape: each port owns its slice.
- **Supersede the web mapper with the port.** Bundle 64 extracted
  `loadFriendEdges` into `lib/mappers/` as the interim DRY win; the proper home
  is the hexagonal port (test seam + no raw web query). Deleted
  `lib/mappers/friend.ts` (its `mappers/` dir is now empty) — noted so the
  Bundle-64 audit reference isn't mistaken for still-live code.
- **Client injected, edge-scoped.** Pages pass their `getServerSupabase()`
  client; the friendship reads are explicitly `.eq('user_id'/'friend_id', …)`,
  so results are identical regardless of RLS posture, and the viewer's session
  client is preserved (no admin escalation).
- **Preserve edge order, drop missing profiles.** `friendIds.map(id =>
cards.get(id)).filter(...)` keeps the friendship order and silently skips any
  id without a public profile — matching the old behaviour.

## Changes

- Domain: `users/social-graph-queries.ts` — `getFriendEdges` + `FriendEdges`
  (imports `ProfileCard`).
- Infra: `supabase-social-graph-repository.ts` — `getFriendEdges` impl + a lazy
  `profiles` (`ProfileQueries`) dependency, default `SupabaseProfileRepository`.
- Web: `profile/page.tsx` + `friends/page.tsx` → `getFriendEdges`;
  `components/friends-list.tsx` → `ProfileCard` (camelCase JSX);
  `lib/mappers/friend.ts` deleted.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(313 tests; lint 0 errors). No DB change.

## Follow-ups (rest of Phase 2b, P2-1)

- **`load-event-detail.ts`** profile reads (admin-client `unstable_cache`
  loader — its own careful increment).
- **`friendships` writes** (`friends/actions.ts` add/remove) — belong on the
  `UserProfile` aggregate (it already has `addFriend`/`removeFriend`) +
  `UserRepository`; part of the bigger aggregate-write increment, which the
  read seam (getViewerFriends/getFriendEdges) now sits in front of.
- `GroupRepository` (Phase 3) + notification outbox still untouched.
