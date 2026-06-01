# Groups directory: counts, follow-from-grid, shared card (G-1…G-5) (2026-06-01)

## Context

Shipped all five findings from [groups-page-ux.md](../audits/groups-page-ux.md).
The groups directory was already well-built (no P1/P2) — this bundle is polish +
**convergence** with its sibling `/players` and the home-page peek. It also
closes the long-open **home-page-ux H-4** (the group card was hand-rolled twice
and drifting).

## Decisions

- **G-1 — member count, not follower count.** "Is this group alive" wants a
  social-proof number. `group_followers` is owner-only under RLS and its
  aggregate view is granted to `authenticated` only, so it's **unreadable on the
  anon ISR directory**; `group_members` is `select using (true)` (public), so a
  member count is anon-safe. `searchDirectory` fetches member rows for the
  visible ids in one query and tallies in JS (degrades to no chip on error). Not
  a column-add, but bounded by the page size and amortized by the 60s ISR TTL.
  Event count deferred (a heavier join, and not the primary "is it real" signal).
- **G-2 — the groups twin of the players follow-island.** PL-2 just built the
  "one provider resolves the viewer + edge-set once, per-card island buttons,
  null for anon, layered on the ISR shell" pattern. Groups are followable
  (`group_followers` + `followGroup`/`unfollowGroup`), so this is a near-verbatim
  port — `groups-follow.tsx` reads `group_followers` (the viewer's own edges,
  allowed by the owner-only select policy) and calls the group follow actions.
  Kept it a **parallel file** rather than generalizing the players provider: the
  two differ in table + actions, and a premature generic abstraction would be
  more indirection than two focused ~140-line files. (Generalizing is a
  reasonable future refactor — noted below.)
- **G-5 — extract once, host the action via a slot.** The shared `GroupCard`
  renders the `<li>` (parent owns the `<ul>` grid), uses the stretched-link
  pattern, and takes an optional `action` ReactNode slot. The directory passes
  `<GroupFollowButton>` into that slot (it sits inside the `GroupsFollowProvider`
  subtree, so context flows); the home peek passes nothing. One component, two
  call sites, both hand-rolled copies deleted. The home card gains the
  description for free, and the now-unused `Image` import was dropped from the
  home page.
- **G-3/G-4 — mirror the players fixes** verbatim (input → `fieldInputClass` with
  `items-center`; header count), so the two directories finally read the same.

## Changes

- [group-queries.ts](../../packages/domain/src/groups/group-queries.ts) — optional
  `GroupCard.memberCount`.
- [supabase-group-query-repository.ts](../../packages/infrastructure/src/supabase-group-query-repository.ts)
  — `searchDirectory` attaches `memberCount` via a `countMembers` aggregate.
- [groups/\_components/group-card.tsx](../../apps/web/src/app/groups/_components/group-card.tsx)
  — new shared `GroupCard`.
- [groups/\_components/groups-follow.tsx](../../apps/web/src/app/groups/_components/groups-follow.tsx)
  — new `GroupsFollowProvider` + `GroupFollowButton`.
- [groups/page.tsx](../../apps/web/src/app/groups/page.tsx) — header count, input
  vocab, `GroupCard` + provider + follow button (dropped inline `Image`/`Link`).
- [page.tsx](../../apps/web/src/app/page.tsx) — home peek uses `GroupCard`
  (dropped inline group tile + `Image` import).

## Patterns observed

- **The "viewer-context provider + island buttons on an ISR list" pattern now
  has two instances** (`players-follow`, `groups-follow`). They differ only in
  the edge table (`friendships` / `group_followers`) and the follow/unfollow
  actions. A third consumer would justify extracting a generic
  `FollowProvider<{ loadEdges, follow, unfollow }>` — until then, parallel files
  keep each readable. Flagged for whoever adds the next followable directory.
- **A shared card with an optional `action` slot is the clean way to let one
  component serve a plain listing and an interactive one.** Server `GroupCard`
  renders a client `action` child only where provided; the provider wrapping the
  grid supplies its context. Same shape worth reaching for if `EventCard` ever
  needs per-card actions.

## Follow-ups

- **G-1 scale path:** the JS member-count tally fetches all member rows for the
  visible groups; fine at the current scale + 60s TTL, but a `group_member_counts`
  view (or a counted RPC) would bound it if groups grow large. Logged in
  [groups-page-ux.md](../audits/groups-page-ux.md).
- **Generic follow provider** (see Patterns) if a third followable directory lands.
- **`/groups/[id]`** (the group detail page) remains un-audited — a future pass.
