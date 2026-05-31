# 2026-05-29 — Bundle: Phase 2a — SocialGraphQueries port (shrink the EventRepository god-port)

## Context

First increment of Phase 2 from the
[architecture re-audit](../audits/architecture.md#reevaluation--2026-05-29).
Phase 2 as scoped is large (2–3 days: a `ProfileRepository` for the orphan
`UserProfile` aggregate **plus** draining ~38 raw `profiles`/`friendships`
queries out of the web layer **plus** pulling the friend-graph reads off
`EventRepository`). This bundle does the last part — the self-contained piece
that directly attacks the **P2-2 god-port** — and leaves the `ProfileRepository`

- web-query drain (P2-1) as Phase 2b.

`EventRepository` hosted two reads that have nothing to do with the event
aggregate: `getViewerFriends` and `searchFollowingFeed`. They only lived there
because the friend graph had no port of its own.

## Decisions

- **Carve Phase 2 at the god-port seam first.** Moving the two friend-graph
  reads to a dedicated `SocialGraphQueries` port is fully self-contained and
  verifiable, and it's the prerequisite the broader `ProfileRepository` work
  builds on. Chose it over starting the 38-query web drain, which is bigger and
  benefits from the port existing first.
- **New port lives with `UserProfile`, not events.** `SocialGraphQueries` plus
  the three read-model types (`FriendProfile`, `FollowingFeedItem`,
  `FollowingFeedFilters`) moved to `packages/domain/src/users/`. The domain
  barrel re-exports them, so every existing `@pickupvb/domain` import keeps
  working with zero call-site churn (only `event-detail.handler.ts` and
  `messages.ts` referenced them, both via the barrel).
- **`GetEventDetailHandler` stays on `EventRepository`;** only
  `GetViewerFriendsHandler` + `GetFollowingFeedHandler` switch to the new port.
  The `getDetail` read model's inline `friendships` read (the per-event
  `viewerFriendIds`) stays in the event adapter — it's event-scoped viewer
  context, not a standalone social-graph query.
- **No behaviour change.** The two method bodies moved verbatim into
  `SupabaseSocialGraphRepository` (same admin-client default, same queries).
  Pure structural move.

## Changes

Domain:

- `users/social-graph-queries.ts` (new) — `SocialGraphQueries` port +
  `FriendProfile` / `FollowingFeedItem` / `FollowingFeedFilters` (moved from
  `events/event-repository.ts`). Exported via `users/index.ts`.
- `events/event-repository.ts` — removed the two method signatures + the three
  types (replaced with a P2-2 note).

Infrastructure:

- `supabase-social-graph-repository.ts` (new) — `SupabaseSocialGraphRepository`
  implements the port (the two method bodies, moved verbatim). Exported from
  the infra barrel.
- `supabase-event-repository.ts` — deleted both methods; dropped the five
  now-unused imports (`FriendProfile`, `FollowingFeedItem`,
  `FollowingFeedFilters`, `skillBandTiers`, `SkillBand`).

Application:

- `queries/event-detail.handler.ts` — `GetViewerFriendsHandler` +
  `GetFollowingFeedHandler` now depend on `SocialGraphQueries` (field renamed
  `repo` → `social`).

Web:

- `lib/handlers.ts` — construct `SupabaseSocialGraphRepository`; wire it into
  the two handlers; add to the `repositories` export.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(309 tests; lint 0 errors). No DB change.

## Patterns observed

- **Barrel re-export = zero-churn type moves.** Moving the three read-model
  types between domain files cost no call-site edits because everything imports
  from `@pickupvb/domain`, not the file. The same trick made Phase 0's
  smart-constructor co-location free.
- **Pick the smallest seam that's still a real win.** The god-port (P2-2) is
  big, but the friend-graph reads were a clean, severable slice — one port, one
  adapter, two handlers, no behaviour change. The rest of the port split
  (read-vs-write, co-host, division-attach) can come in its own increment.

## Follow-ups (rest of Phase 2)

- **`ProfileRepository` + web-query drain (P2-1, Phase 2b).** Wire the orphan
  `UserProfile` aggregate (it even has an unused `UserRepository` port already
  declared) and migrate the ~38 raw `profiles`/`profiles_public`/`friendships`
  queries in the web layer behind it.
- **Further `EventRepository` ISP split (rest of P2-2).** The port still mixes
  write-side (`findById`/`save`), read models (`search`/`getDetail`), co-host
  mutation, and `setRosterTeamForfeited`. Segregating those is a later
  increment.
