# Pagination sweep — unbounded UI lists (2026-05-31)

## Context

User asked for an audit of UI list views that render a full result set with no
pagination, flagging the `/profile` Hosting section as one example. A read-only
sweep found ten list surfaces; six graded P2 (grow monotonically over time or
per power-user), the rest P3. This bundle ships the six P2 fixes. Findings +
remediation table:
[performance.md § Pagination sweep](../audits/performance.md#2026-05-31--pagination-sweep-unbounded-ui-lists).

The directory pages (`/players`, `/groups`, `/teams`) and the past-events
sections of `/groups/[id]` and `/players/[id]` already paginated via the shared
[`Pagination`](../../apps/web/src/components/pagination.tsx) component — they
were the reference pattern for everything here.

## Decisions

- **In-memory slice over SQL `.range()` for grouped/derived/merged lists.**
  Receipts and earnings group raw `event_payment_audit` rows by
  `payment_intent_id` _in memory_, so a `.range()` over raw rows would split a
  paid+refund pair across a page boundary and corrupt the net. Hosting merges
  primary-host + co-host events from two queries, so there's no single SQL
  window. In all three, the page-level totals/years/CSV need the full set
  regardless. Chose the existing group/player past-events convention: fetch all,
  derive, then slice the derived array for display. Matches the codebase and
  needs no schema work.

- **Attendee roster: server-side query-param paging over a client "show all"
  toggle.** [`AttendeeList`](../../apps/web/src/components/attendee-list.tsx) is
  a server component rendering per-row bound server actions (follow / unfollow /
  mark-paid). Converting it to a client component for a `useState` toggle would
  hit the documented "functions cannot be passed to Client Components" RSC
  pitfall (AGENTS.md). An `apage` query param keeps it a server component. Hosts
  who want the whole roster already have the CSV export, so paging the on-page
  list costs them nothing.

- **Friends fix skipped the domain port** despite the initial audit note to "add
  limit/offset to the repo." Two reasons: (1) `getFriendEdges` →
  `findCardsByIds` is a single `in(...)` query, not an N+1, so repo-level
  slicing barely reduces DB cost; (2) the `/friends` page builds `excludeIds`
  (the add-friend picker's "already following" filter) from the **full** id set,
  so the port would have to return every id anyway. In-memory slice at the call
  site is correct and leaves the `SocialGraphQueries` port untouched.

- **Page the display; compute aggregates/exclude-sets/counts over the full
  set.** Every fix keeps the complete array for the things that must be whole
  (totals, CSV years, `excludeIds`, `existingMemberIds`, the `(N)` header count)
  and slices only what's rendered.

## Changes

- [profile/page.tsx](../../apps/web/src/app/profile/page.tsx) — `hpage` param +
  `HOSTED_PER_PAGE = 8`; `<Pagination scrollToId="hosting">`.
- [receipts/page.tsx](../../apps/web/src/app/profile/receipts/page.tsx) — `page`
  param + `RECEIPTS_PER_PAGE = 20`; paged transactions table.
- [earnings/page.tsx](../../apps/web/src/app/profile/billing/earnings/page.tsx) —
  `page` param + `EVENTS_PER_PAGE = 20`; paged "By event" table.
- [attendees-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/attendees-panel.tsx)
  — new `page` / `searchParams` props, `ATTENDEES_PER_PAGE = 30`; sliced list +
  `<Pagination pageParam="apage" scrollToId="attendees">`. Wired from
  [events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx).
- [friends/page.tsx](../../apps/web/src/app/friends/page.tsx) — `page` param +
  `FRIENDS_PER_PAGE = 24`; sliced display, full set kept for `excludeIds`.
- [members/page.tsx](../../apps/web/src/app/groups/%5Bid%5D/members/page.tsx) —
  `page` param + `MEMBERS_PER_PAGE = 24`; sliced display, full set kept for
  `existingMemberIds`.

P3 follow-up (same day):

- [profile/page.tsx](../../apps/web/src/app/profile/page.tsx) — also paged the
  **Following** (`fpage` / 24) and **Videos** (`vpage` / 6 — iframe embeds, so a
  small page) sub-lists. **Groups** left unpaged on purpose: bounded
  (self-managed memberships, <10 typical) and `MyGroupsSection` owns its own
  `(N)` count, so paging it would mean changing the component contract for no
  real gain.

## Patterns observed

- **The "paginated section" recipe is now used in ~9 places** and is stable
  enough to state plainly: read a page param off `searchParams`, slice the
  already-loaded array, render `<Pagination basePath pageSize total
searchParams [pageParam] [scrollToId]>`, and keep the full array for
  aggregates/exclude-sets. `pageParam` lets one page host several independent
  paginators (`mpage`/`ppage`/`hpage`/`apage`). Promoted to AGENTS.md "Patterns
  surfaced by audits" (item 12) so the next agent reaches for it instead of a
  one-off.
- **`Pagination` self-hides at ≤1 page** (`totalPages <= 1` → `null`). When it
  sits inside a bordered/padded wrapper (earnings, attendees), guard the wrapper
  with `total > PER_PAGE` so an empty bordered strip doesn't render.

## Follow-ups

- **Deferred (needs a production RPC migration) — `/messages` inbox `p_limit:
50` cap.** No "load older"; real paging needs offset/cursor + a count fn in
  `get_inbox`, a `ConversationQueries` port change, and `/messages` paging.
  Deferred 2026-05-31 — not worth a prod schema migration for a P3 at current
  scale.
- **Deferred (migration + product call) — `/events` + `/community` discovery
  feeds** capped at `limit` 30/60. Real paging needs offset + total on the
  search RPCs **and** a feed-vs-directory decision (the `/events` page has tabs +
  filters, so paging is per-tab). Deferred 2026-05-31 pending that call.
- **Not a pagination item — `/profile/billing/analytics`** loads all host events
  to aggregate then `slice(0, 10)`. A query-cost concern; fix is SQL-side
  aggregation, tracked separately.
- **Done — profile Following + Videos** (see Changes). Groups deliberately left
  unpaged (bounded; owns its own count).

All four verify steps pass (`pnpm typecheck && pnpm lint && pnpm test && pnpm
build`). No e2e impact (no covered journey asserts full-list rendering).
