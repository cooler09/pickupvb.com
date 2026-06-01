# Groups Directory UX Audit

_Last updated: 2026-06-01_

UX/UI evaluation of the **groups directory**
([apps/web/src/app/groups/page.tsx](../../apps/web/src/app/groups/page.tsx)) —
the public, ISR-cached listing of clubs, leagues, and crews, a sibling of
`/players` and `/teams` in the nav's Community group.

Goal: same lens as the other directories — make each card carry enough signal to
answer _"is this a real, active group I'd want to join or follow?"_, let the page
act on that intent, and converge it with its siblings.

This file is complementary to — not a duplicate of:

- [players-page-ux.md](players-page-ux.md) — the sibling directory; **several
  findings here are direct analogs** (G-2↔PL-2 follow-from-directory, G-3↔PL-3
  field vocab, G-4↔PL-4 result count) and should reuse those fixes.
- [home-page-ux.md](home-page-ux.md) — **G-5 is the same drift as the still-open
  H-4** (the group card is hand-rolled on both the home page and here, and they've
  diverged); one shared `GroupCard` closes both.
- [persona-ux.md](persona-ux.md) — CTA/field vocabulary; G-3 is the CC-2 drift.
- [privacy.md](privacy.md) — public group reads; no PII surface to re-litigate.

> **Status update (2026-06-01):** Full persona-lens evaluation; **all five
> findings (G-1…G-5) shipped the same day.** No P1, no P2 — a well-built
> directory that got polish + convergence: G-1 a **member-count** chip on the
> card (anon-safe aggregate over `group_members`); G-2 **follow from the
> directory** via a `GroupsFollowProvider` + `GroupFollowButton` (the groups twin
> of the players follow-island); G-3 search input → `fieldInputClass`; G-4
> "Groups & organizations · {total}" count; G-5 a shared **`GroupCard`** used by
> both the directory and the home peek — **which closes home-page-ux H-4.**
>
> Grounding facts that shaped grading: `GroupCard`
> ([group-queries.ts#L11-L19](../../packages/domain/src/groups/group-queries.ts#L11-L19))
> carries `description` already; the `groups` table has **no member/event count
> column** (counts need an aggregate over `group_members`); and groups **are
> followable** — `group_followers` + `followGroup`/`unfollowGroup`
> ([groups/follow-actions.ts](../../apps/web/src/app/groups/follow-actions.ts))
> already exist, so G-2 can reuse the players follow-island pattern.

---

## Persona model

| Persona               | What the groups directory must make obvious                                  |
| --------------------- | ---------------------------------------------------------------------------- |
| **Visitor** (no auth) | "Are there real, active clubs here?" — scannable cards with social proof     |
| **Player / attendee** | A club/crew to join or follow, near me — location + size + a way to act      |
| **Host / organizer**  | A fast path to start their own group (the `+ New group` CTA — already there) |

---

## What's already good (so we don't regress it)

- **Richer card than `/players` had:** avatar, name, city/region, and a
  `line-clamp-2` description
  ([page.tsx#L86-L123](../../apps/web/src/app/groups/page.tsx#L86-L123)).
- **`NewGroupButton` self-hides for signed-out _and_ anonymous** viewers
  ([new-group-button.tsx#L25-L28](../../apps/web/src/app/groups/_components/new-group-button.tsx#L25-L28))
  — the V-4 anon-gate concern is already handled here (no host/create depth
  shown to anon).
- **Search button already uses `primaryButtonClass()`** — ahead of `/players`,
  which had to be promoted in PL-3.
- **ISR-cacheable** (`revalidate = 60`, anon client), whole-card click target,
  shared `Pagination` with SQL `range` + `count: 'exact'`.

---

## Findings

### A. Information scent (the card's job)

#### G-1 — No social-proof / activity signal on the card · **P3** · ✅ resolved 2026-06-01

The card answers "what is this group" (name + city + description) but not "is it
**alive**" — there's no member count, follower count, or "N upcoming events." For
a visitor deciding whether a club is worth joining, size/activity is the missing
signal. Unlike the players PL-1 fix (a column already in `profiles_public`), this
is **not** a column-add: `groups` has no count column, so it needs an aggregate
over `group_members` / `group_followers` (and event count over `events.host_group_id`).
**Fix (done):** `searchDirectory` now fetches **member counts** for the visible
group ids in one query over `group_members` (RLS `using (true)`, so it works on
the anon client) and tallies in JS, attaching `memberCount` to each `GroupCard`
(degrades to no chip on error). The card renders "N members" beside the location.
Chose member count over follower count because `group_followers` is owner-only
and its aggregate view is granted to `authenticated` (not `anon`), so it isn't
readable on the public ISR page; event count deferred (a heavier join). New
optional `GroupCard.memberCount`
([group-queries.ts](../../packages/domain/src/groups/group-queries.ts),
[supabase-group-query-repository.ts](../../packages/infrastructure/src/supabase-group-query-repository.ts)).

### B. Acting on intent

#### G-2 — Can't follow a group from the directory — only click through · **P3** (PL-2 analog) · ✅ resolved 2026-06-01

Groups are followable (`group_followers` + `followGroup`/`unfollowGroup`, and the
group detail page has a follow button via
[group-viewer-actions.tsx](../../apps/web/src/app/groups/[id]/_components/group-viewer-actions.tsx)),
but the directory card only links through — the same missed loop PL-2 fixed for
players. **Fix (done):** new
[groups/\_components/groups-follow.tsx](../../apps/web/src/app/groups/_components/groups-follow.tsx)
— the groups twin of `players-follow.tsx`: a `GroupsFollowProvider` resolves the
viewer + their followed-group set once (one `group_followers` lookup scoped to
the visible ids; the viewer reads their own edges, which the owner-only select
policy allows) and per-card `GroupFollowButton` islands call
`followGroup`/`unfollowGroup` optimistically, rendering nothing for loading/anon
so the ISR shell is untouched. The button rides in the shared `GroupCard`'s
`action` slot above its stretched-link overlay (G-5). Graded **P3** like PL-2
(the group page is the designed follow path), but cheap because the pattern +
actions already existed.

### C. Consistency / convergence

#### G-3 — Search input bypasses the shared field vocabulary · **P3** (PL-3 analog) · ✅ resolved 2026-06-01

The search input hand-rolls `border-border-base bg-surface flex-1 rounded-md
border px-3 py-2 text-sm`
([page.tsx#L57-L64](../../apps/web/src/app/groups/page.tsx#L57-L64)) instead of
`fieldInputClass`. (The Search button is already canonical — only the input
drifts here, the mirror image of PL-3 where the button drifted.) **Fix (done):**
input → `` `${fieldInputClass} flex-1` `` with `items-center` on the flex row so
the label-oriented `mt-1` aligns. Cross-ref persona-ux **CC-2**.
[groups/page.tsx](../../apps/web/src/app/groups/page.tsx).

#### G-4 — No result count · **P3** (PL-4 analog) · ✅ resolved 2026-06-01

`searchDirectory` returns `total`
([page.tsx#L40-L46](../../apps/web/src/app/groups/page.tsx#L40-L46)) but the
"Groups & organizations" header never shows it. **Fix (done):** the header now
reads "Groups & organizations · {total}", matching the `Players · {total}` from
PL-4. [groups/page.tsx](../../apps/web/src/app/groups/page.tsx).

#### G-5 — Group card is hand-rolled here **and** on the home page, and drifting · **P3** (closes home H-4) · ✅ resolved 2026-06-01

The group tile is reimplemented at
[page.tsx#L86-L123](../../apps/web/src/app/groups/page.tsx#L86-L123) and again on
the home page
([page.tsx#L181-L208](../../apps/web/src/app/page.tsx#L181-L208)); they've already
diverged (home: 1-char avatar fallback in a `<div>`, no description; directory:
2-char fallback in an `aria-hidden <span>`, 2-line description). This is exactly
**home-page-ux H-4**. **Fix (done):** extracted a shared `GroupCard` server
component ([group-card.tsx](../../apps/web/src/app/groups/_components/group-card.tsx))
— whole-tile stretched link, optional `memberCount` chip (G-1) and an optional
`action` slot (the G-2 follow button) — and used it on **both** the directory
([groups/page.tsx](../../apps/web/src/app/groups/page.tsx)) and the home-page peek
([page.tsx](../../apps/web/src/app/page.tsx)), deleting both hand-rolled copies.
Same shared-component playbook as `EventCard`. **Closes home-page-ux H-4.** (Home
cards now also show the description — a free improvement; the `Image` import was
dropped from the home page as it's no longer used there.)

---

## Out of scope

- **`/groups/[id]`** (the group detail/profile page the cards link to) is a
  distinct, richer surface — its own UX audit if/when we get there. This file
  covers the **directory** only.

## Remediation log

### 2026-06-01 — G-1…G-5 bundle (counts + follow + vocab + shared card)

Shipped all five findings the same day. Verified `pnpm typecheck && lint && test
&& build` (all green; the two new components added zero lint warnings). Journal:
[2026-06-01-groups-directory.md](../journal/2026-06-01-groups-directory.md).

- **G-1 ✅** — `searchDirectory` attaches `memberCount` via an anon-safe aggregate
  over `group_members`; the card shows "N members". New optional
  `GroupCard.memberCount`.
- **G-2 ✅** — new
  [groups/\_components/groups-follow.tsx](../../apps/web/src/app/groups/_components/groups-follow.tsx)
  (`GroupsFollowProvider` + `GroupFollowButton`), the groups twin of
  `players-follow.tsx`, reading `group_followers` and calling
  `followGroup`/`unfollowGroup`; renders nothing for anon, layered on the ISR shell.
- **G-3 ✅** — search input → `` `${fieldInputClass} flex-1` `` with `items-center`.
- **G-4 ✅** — "Groups & organizations · {total}" header count.
- **G-5 ✅** — shared `GroupCard`
  ([group-card.tsx](../../apps/web/src/app/groups/_components/group-card.tsx)) on
  both the directory and the home peek; both hand-rolled copies deleted.
  **Closes home-page-ux H-4.**

_All findings resolved. Re-audit if the page changes materially._
