# 2026-05-29 — Bundle: Phase 2b (increment 10) — friend writes

The last profile-write piece of the P2-1 drain. inc. 8–9 migrated the
`profiles`-column writes behind the `UserProfile` aggregate; this migrates the
`friendships` edge writes — a deliberately **different shape** (an edge table,
not a profile column), per [ADR 0020](../adr/0020-user-profile-write-aggregate.md) §5.

## What changed

`UserRepository` gained two focused edge operations:

- `addFriendEdge(viewerId, friendId)` — an idempotent upsert
  (`onConflict: 'user_id,friend_id', ignoreDuplicates: true`) so re-following an
  existing edge is a no-op.
- `removeFriendEdge(viewerId, friendId)` — a `DELETE` on `(user_id, friend_id)`.

The self-friend invariant moved to a **static** `UserProfile.assertCanFriend`
guard. `AddFriendHandler` / `RemoveFriendHandler` join the per-request
`getUserProfileHandlers()` factory, and `friends/actions.ts` `addFriend` /
`removeFriend` route through them — off raw `supabase.from('friendships')`.

## Decisions

- **Focused edge ops, not whole-set reconcile (the approved call).** A single
  "follow" must not rewrite the viewer's entire friend set, and reconciling a
  set we don't even load on `findById` would be nonsense. So the edge writes are
  surgical INSERT/DELETE on the `UserRepository`, exactly as scoped in ADR 0020
  §5 — mirroring (not duplicating) the aggregate's role.
- **Static guard, no load-and-discard.** The only friend-add invariant is "not
  yourself." Loading the full aggregate just to call instance `addFriend` and
  throw away the in-memory mutation is precisely the anti-pattern ADR 0019
  deleted from the registration path. So the rule lives in a static
  `UserProfile.assertCanFriend(viewer, friend)`; the instance `addFriend`
  delegates to it (DRY), and `AddFriendHandler` calls the static directly before
  the focused edge write. No aggregate round-trip for an edge toggle.
- **Idempotent add.** The old action did a bare `insert` and ignored the result
  (so a duplicate 23505 was silently swallowed). `addFriendEdge` makes that
  intent explicit with `ignoreDuplicates`, and now surfaces _real_ failures
  (the old code couldn't). The client island (`player-viewer-actions.tsx`)
  already wraps the call in `try/catch` with optimistic rollback, so a genuine
  error rolls the button back rather than wedging the UI.
- **`removeFriend` needs no guard.** Removing a `(viewer, viewer)` edge that
  can never exist is a harmless no-op, so `RemoveFriendHandler` skips the
  self-check.
- **The follow-state _read_ stays raw — on purpose.** `player-viewer-actions.tsx`
  hydrates with a `createSupabaseBrowserClient().from('friendships')` lookup in a
  `'use client'` island. That's a browser-client read; it can't use a server-side
  port, and it isn't part of the server-layer `supabase.from` boundary P2-1
  tracks. Left as-is, noted so it isn't mistaken for a missed write.

## Changes

- Domain: `users/user-profile.ts` — static `assertCanFriend` (instance
  `addFriend` delegates to it); `UserRepository.addFriendEdge` /
  `removeFriendEdge`. `users/user-profile.test.ts` — static-guard test.
- Application: `messages.ts` — `AddFriendCommand` / `RemoveFriendCommand`;
  `commands/user-profile.handler.ts` — `AddFriendHandler` / `RemoveFriendHandler`.
- Infra: `supabase-user-repository.ts` — `addFriendEdge` (idempotent upsert) /
  `removeFriendEdge` (delete).
- Web: `lib/handlers.ts` — `getUserProfileHandlers()` returns the two;
  `friends/actions.ts` migrated.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 240, application 42, web 50, infra 7; lint 0 errors). No DB change.

## Where P2-1 stands after inc. 10

The **profiles + friendships** slice of the web-layer DB-leakage finding is
effectively closed: reads behind `ProfileQueries` / `SocialGraphQueries`
(inc. 1–7), writes behind the `UserProfile` aggregate + `UserRepository`
(inc. 8–10). Remaining on P2-1, each its own effort:

- **`load-event-detail.ts` host social-handles read** — distinct read shape,
  still deferred (low value; would need a one-off social-handles read model).
- **`GroupRepository` + `Group` aggregate** (Phase 3, ~28 raw
  `groups`/`group_members`/`group_followers` hits) — the next big subdomain.
- **Notification outbox** (`notification_outbox` / `broadcasts` /
  `push_subscriptions`) — a `NotificationOutboxPort`.
