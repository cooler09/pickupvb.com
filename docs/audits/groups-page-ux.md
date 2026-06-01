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

> **Status update (2026-06-01):** Full persona-lens evaluation. **Nothing shipped
> yet** — findings pass. This is a **well-built directory**: there's **no P1 and
> no P2** — the card already carries name + location + a 2-line description
> (richer than the players card was pre-PL-1), it's ISR-cacheable, paginated, and
> `NewGroupButton` already self-hides for anon/signed-out. Five **P3** polish +
> consistency items (G-1…G-5), most mirroring the players fixes.
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

#### G-1 — No social-proof / activity signal on the card · **P3**

The card answers "what is this group" (name + city + description) but not "is it
**alive**" — there's no member count, follower count, or "N upcoming events." For
a visitor deciding whether a club is worth joining, size/activity is the missing
signal. Unlike the players PL-1 fix (a column already in `profiles_public`), this
is **not** a column-add: `groups` has no count column, so it needs an aggregate
over `group_members` / `group_followers` (and event count over `events.host_group_id`).
**Recommended fix:** fetch counts for the visible group ids in one grouped query
(the same "one scoped lookup for the whole page" shape as the PL-2 provider) and
render e.g. "12 members · 3 upcoming" on the card. Start with member **or**
follower count (one query) before adding event count. P3 (social proof, not a
blocker; the card already reads as a real group).

### B. Acting on intent

#### G-2 — Can't follow a group from the directory — only click through · **P3** (PL-2 analog)

Groups are followable (`group_followers` + `followGroup`/`unfollowGroup`, and the
group detail page has a follow button via
[group-viewer-actions.tsx](../../apps/web/src/app/groups/[id]/_components/group-viewer-actions.tsx)),
but the directory card only links through — the same missed loop PL-2 fixed for
players. **Recommended fix:** reuse the **exact** pattern just built for players
— a `GroupsFollowProvider` that resolves the viewer + their followed-group set
once (one `group_followers` lookup scoped to the visible ids) and per-card
`FollowButton` islands calling `followGroup`/`unfollowGroup`, rendering nothing
for loading/anon, layered onto the ISR shell. Card gets the stretched-link
treatment so the button coexists with whole-tile navigation. Graded **P3** for
the same reason as PL-2 (following from the group page is the designed path), but
it's high-leverage because the pattern + actions already exist.

### C. Consistency / convergence

#### G-3 — Search input bypasses the shared field vocabulary · **P3** (PL-3 analog)

The search input hand-rolls `border-border-base bg-surface flex-1 rounded-md
border px-3 py-2 text-sm`
([page.tsx#L57-L64](../../apps/web/src/app/groups/page.tsx#L57-L64)) instead of
`fieldInputClass`. (The Search button is already canonical — only the input
drifts here, the mirror image of PL-3 where the button drifted.) **Recommended
fix:** input → `fieldInputClass` (with `items-center` on the row so its
label-oriented `mt-1` aligns, as in the PL-3 fix). Cross-ref persona-ux **CC-2**.

#### G-4 — No result count · **P3** (PL-4 analog)

`searchDirectory` returns `total`
([page.tsx#L40-L46](../../apps/web/src/app/groups/page.tsx#L40-L46)) but the
"Groups & organizations" header never shows it. **Recommended fix:** show the
count in the header (e.g. "Groups & organizations · {total}"), matching the
`Players · {total}` from PL-4.

#### G-5 — Group card is hand-rolled here **and** on the home page, and drifting · **P3** (closes home H-4)

The group tile is reimplemented at
[page.tsx#L86-L123](../../apps/web/src/app/groups/page.tsx#L86-L123) and again on
the home page
([page.tsx#L181-L208](../../apps/web/src/app/page.tsx#L181-L208)); they've already
diverged (home: 1-char avatar fallback in a `<div>`, no description; directory:
2-char fallback in an `aria-hidden <span>`, 2-line description). This is exactly
**home-page-ux H-4** (still open). **Recommended fix:** extract a `GroupCard`
server component under `apps/web/src/app/groups/_components/group-card.tsx`
(props: `slug`, `name`, `avatarUrl`, `homeCity`, `region`, `description?`, and
optionally the G-1 counts) and use it on both pages — the same shared-component
playbook as `EventCard`. Closes G-5 **and** H-4 in one move.

---

## Out of scope

- **`/groups/[id]`** (the group detail/profile page the cards link to) is a
  distinct, richer surface — its own UX audit if/when we get there. This file
  covers the **directory** only.

## Remediation log

_None yet — findings pass only (2026-06-01). Update this section with a dated
entry when a bundle lands, per [README.md](README.md)._
