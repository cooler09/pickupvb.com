# 2026-05-29 — Bundle: Phase 3 (increment 3) — group follow edges

Continues the groups drain: the `group_followers` follow/unfollow writes move
behind `GroupRepository`. Same focused-edge-op shape as the friend edges
(inc. 10 / ADR 0020 §5).

## What changed

- **Domain** (`groups/group.ts`): `GroupRepository` gains `addFollowEdge(groupId,
userId)` / `removeFollowEdge(groupId, userId)`. A follow is a viewer's own
  self-scoped edge with **no group-side invariant**, so these are pure repo ops —
  they don't touch the `Group` aggregate.
- **Infra** (`supabase-group-repository.ts`): `addFollowEdge` is an idempotent
  upsert (`onConflict: 'group_id,user_id', ignoreDuplicates`); `removeFollowEdge`
  a delete.
- **Application**: `FollowGroupCommand` / `UnfollowGroupCommand` +
  `FollowGroupHandler` / `UnfollowGroupHandler` (thin — no aggregate load).
- **Web**: `getGroupHandlers()` returns the two; `follow-actions.ts` migrated off
  raw `supabase.from('group_followers')`.

## Decisions

- **No aggregate involvement.** Unlike membership (role rules + last-owner
  invariant, which need the loaded roster), a follow has no group-side rule —
  `group_followers` is self-only under RLS. So this is a focused edge op on the
  repo, the same call shape the user approved for friend edges. Adding a
  no-op aggregate method would be ceremony.
- **Best-effort, swallow on failure.** `followGroup` / `unfollowGroup` run via
  plain `<form action={…}>` submissions inside the `GroupViewerActions` client
  island, which has **no** try/catch around them (unlike the friends client,
  which rolls back optimistically). The prior raw code ignored its insert/delete
  error result, so a failure was silent. To preserve that — and avoid throwing a
  rare follow failure into the React error boundary — the migrated actions
  swallow errors (idempotent upsert means there's no expected error anyway).
  This mirrors the theme-toggle best-effort decision (inc. 9).
- **Thin handlers for uniformity.** `FollowGroupHandler` just calls the repo edge
  op, but keeping it on `getGroupHandlers()` keeps one write entry point for the
  groups subdomain (same as inc. 1/2).
- **No new tests.** Pure edge plumbing with no domain rule — per AGENTS.md, skip
  the test. The `group_followers` follow-state **read** in `group-viewer-actions.tsx`
  stays (browser-client island hydration, not a server-layer port concern).

## Changes

- Domain: `groups/group.ts` — `addFollowEdge` / `removeFollowEdge` on the port.
- Application: `messages.ts` (2 commands); `commands/group.handler.ts` (2 handlers).
- Infra: `supabase-group-repository.ts` (2 edge ops).
- Web: `lib/handlers.ts` (`getGroupHandlers()` +2); `groups/follow-actions.ts`.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 265, application 42, web 50, infra 7; lint 0 errors). No DB change.

## Follow-ups (rest of Phase 3, P2-1)

- **inc. 4 — delete.** Fold `delete-actions.ts` (keep its upcoming-events guard +
  admin-client soft-delete; already typed-error clean) onto the aggregate /
  repository.
- **Reads** (`groups/**` pages, `sitemap`, `profile`, `events/new`) → a
  `GroupQueries` read port.
- The shared `hero-image-actions.ts` groups branch stays raw (cross-aggregate).
