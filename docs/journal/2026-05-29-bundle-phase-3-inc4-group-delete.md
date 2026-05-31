# 2026-05-29 — Bundle: Phase 3 (increment 4) — group delete

The last group **write**. Folds `deleteGroupAction` onto the aggregate. With
this, every group write (create/update, membership, follow, delete) lives behind
`GroupRepository` — the groups subdomain's write side is fully drained.

## What changed

- **Domain** (`groups/group.ts`): `Group.assertCanDelete(actorId)` — owner-only
  guard (mirrors the `groups_delete` RLS), using the roster. A guard, not a
  state change: `deleted_at` isn't modeled (a loaded `Group` is always
  non-deleted), so the write stays a focused repo/closure op.
- **Application**: `DeleteGroupCommand` + `DeleteGroupHandler`. The handler does
  owner-authz via the aggregate, then runs two **injected closures**:
  `hostsUpcomingEvents(groupId)` (the cross-aggregate guard) and
  `softDelete(groupId)` (the write). Pure — no Supabase, no admin client.
- **Web** (`lib/handlers.ts`): `getGroupHandlers()` builds the two closures —
  `hostsUpcomingEvents` (user-client `events` count) and `softDeleteGroup`
  (admin-client `deleted_at` flip) — and wires `DeleteGroupHandler`.
  `delete-actions.ts` becomes a thin orchestrator: `requireRealUser` → handler →
  revalidate + redirect, with **zero raw `supabase` queries**.

## Decisions

- **Owner rule → the aggregate; cross-aggregate guard + admin write → injected
  closures.** The delete is genuinely multi-concern: owner authorization (a
  domain rule, now `assertCanDelete`), a "no upcoming hosted events" guard (an
  _events_ read the `Group` aggregate can't and shouldn't do), and the
  `deleted_at` write (which must use the service-role client — see below). The
  established way to feed a handler a cross-aggregate read is an injected
  function (`ClaimCommunityListingHandler`'s `loadEventClaimFacts`); I used the
  same shape for **both** the events guard and the admin write. The handler stays
  pure and testable; the composition root owns the clients.
- **Admin-client soft-delete is sanctioned, not a smell.** RLS quirk: the
  `groups_select` policy (`deleted_at is null`) is applied as an implicit
  WITH CHECK on UPDATE, so flipping `deleted_at` through the user client fails
  (the after-image would be invisible to the actor). The owner check runs in the
  application layer first (`assertCanDelete`), so the admin write is exactly the
  "host-gated operation already authorized in the application layer" case
  AGENTS.md pitfall #8 permits. Kept the rationale as a comment at the wiring
  site so the next reader doesn't try to "fix" it back onto the user client.
- **Closures over a second admin-scoped repo.** I deliberately did **not** give
  `SupabaseGroupRepository` (the user-scoped repo for create/update/member/follow)
  an admin path — pitfall #8 warns that an adapter lazily building its own admin
  client hides RLS-bypass gaps. Keeping the admin write as an explicit closure in
  the composition root makes the bypass visible and auditable.
- **The events guard reads on the user client.** The deleting user is the owner,
  and `events_select` grants group owner/admin visibility into the group's
  events, so the count is accurate (same as the pre-migration code).

## Changes

- Domain: `groups/group.ts` (`assertCanDelete`); `groups/group.test.ts` (+2).
- Application: `messages.ts` (`DeleteGroupCommand`); `commands/group.handler.ts`
  (`DeleteGroupHandler`).
- Web: `lib/handlers.ts` (`getGroupHandlers()` + `deleteGroup` with the two
  closures; `getAdminSupabase` import); `groups/[id]/edit/delete-actions.ts`.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 267, application 42, web 50, infra 7; lint 0 errors). No DB change.

## Where Phase 3 stands

The groups **write** side is fully behind `GroupRepository` + the `Group`
aggregate: profile (inc. 1), membership + last-owner invariant (inc. 2), follow
edges (inc. 3), delete (inc. 4). Remaining P2-1 work, each opportunistic / its
own effort:

- **Group reads** (`groups/**` pages, `sitemap`, `profile`, `events/new`,
  `opengraph-image`) → a `GroupQueries` read port — the largest remaining group
  chunk, but pure read projections (lower risk).
- The deferred `load-event-detail.ts` host social-handles read.
- The **notification outbox** (`notification_outbox` / `broadcasts` /
  `push_subscriptions`) — a `NotificationOutboxPort` (a separate subdomain).
- The shared `hero-image-actions.ts` groups branch (cross-aggregate) stays raw.
