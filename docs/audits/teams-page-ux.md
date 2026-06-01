# Teams Directory UX Audit

_Last updated: 2026-06-01_

UX/UI evaluation of the **teams page**
([apps/web/src/app/teams/page.tsx](../../apps/web/src/app/teams/page.tsx)) — the
third Connect directory, which pairs a viewer-only **"My teams"** panel
([\_components/my-teams-panel.tsx](../../apps/web/src/app/teams/_components/my-teams-panel.tsx))
with a public, ISR-cached **"Discover teams"** listing.

Goal: same lens as `/players` and `/groups` — make each discover card carry the
signal that matters for its persona, and converge the page with its siblings.

This file is complementary to — not a duplicate of:

- [players-page-ux.md](players-page-ux.md) / [groups-page-ux.md](groups-page-ux.md)
  — the sibling directories. TM-2 (field vocab) and TM-3 (result count) are
  direct analogs of PL-3/G-3 and PL-4/G-4. The **follow-from-directory** items
  (PL-2/G-2) have **no analog here** — see the persona note below.
- [persona-ux.md](persona-ux.md) — CTA/field vocabulary; TM-2 is the CC-2 drift.
- [architecture.md](architecture.md) — TM-4 (the discover read is a raw inline
  query, not behind a read-side port like `/players` + `/groups`) is the P2-1
  read-port theme, noted from the UX-consistency angle.

> **Status update (2026-06-01):** Full persona-lens evaluation. **Nothing shipped
> yet** — findings pass. Like `/groups`, this is a **well-built page — no P1, no
> P2**: it already uses a shared `TeamCard`, the Search button is already
> `primaryButtonClass()`, it has a **format filter** (more than the other
> directories), and `MyTeamsPanel` already handles anon/signed-out (a "Sign in to
> create a team" gate). Four **P3** items (TM-1…TM-4), most mirroring the sibling
> directories.
>
> Grounding facts: `team_members` is publicly selectable (RLS `using (true)`) and
> `teams.extra_member_count` + the `format` enum (doubles=2 … sixes=6) are
> available, so the TM-1 roster signal is anon-safe and migration-free. Teams are
> **not self-joinable** (roster is captain-invite-only via `AddTeamMember`), which
> is why there's no follow/join-from-directory finding.

---

## Persona model

| Persona               | What the teams page must make obvious                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| **Player / recruit**  | Which teams exist, their format, and **whether they're recruiting** (roster)   |
| **Team captain**      | My teams + rosters at the top (the `MyTeamsPanel`), a fast "new team" path     |
| **Visitor** (no auth) | "Are there real rosters here?" — scannable cards; the My-teams panel gates off |

**Why no "act from the directory" finding (unlike PL-2/G-2):** players are
followable and groups are followable, but a **team roster is captain-invite-only**
(`AddTeamMember` requires the captain). There's no self-serve "join" or "follow"
a team, so the directory is correctly pure discovery → the team page → the
captain recruits you. Not a gap.

---

## What's already good (so we don't regress it)

- **Shared `TeamCard`** already exists
  ([team-card.tsx](../../apps/web/src/app/teams/_components/team-card.tsx)) and is
  reused by both the discover listing and the My-teams panel (with a role badge)
  — no hand-rolled duplication to fix (contrast G-5).
- **Search button is already `primaryButtonClass()`**, and there's a **format
  filter** select — richer filtering than `/players` or `/groups`.
- **`MyTeamsPanel` handles anon/signed-out** — "Sign in to create a team" rather
  than showing create depth (the V-4 concern is handled here).
- **ISR-cacheable** anon discover read, shared `Pagination` with SQL `range` +
  `count: 'exact'`.

---

## Findings

### A. Information scent (the card's job)

#### TM-1 — Discover cards don't show roster size / "recruiting vs full" · **P3**

The discover `TeamCard` shows name + format + captain
([team-card.tsx#L38-L44](../../apps/web/src/app/teams/_components/team-card.tsx#L38-L44)),
but not **how full the roster is** — the single most useful signal for a player
scanning for a team to join or a captain sizing up the field. A doubles team with
1 player is recruiting; a quad with 4 is full. The data is available and
anon-safe: `team_members` (RLS `using (true)`) for the active roster,
`teams.extra_member_count` for off-site players, and the `format` enum for the
target size (doubles=2, triples=3, quads=4, sixes=6).

**Recommended fix:** count active members for the visible team ids (one query,
anon-safe — the same "one scoped lookup for the page" shape as the groups
`countMembers`), add `extra_member_count` to the discover select + `TeamCardData`,
and render a roster chip on the card — e.g. **"3/4 · recruiting"** (or "Full"
when `rostered >= size`). Keep `TeamCard`'s existing role badge; add the chip as
an optional field so the My-teams panel can opt in later. P3 (informational — you
can't join from here regardless; but high-value scent for the recruit persona).

### B. Consistency / convergence

#### TM-2 — Search input + format select bypass the shared field vocabulary · **P3** (PL-3/G-3 analog)

The search input and the format `<select>` hand-roll `border-border-base
bg-surface rounded-md border px-3 py-2 text-sm`
([page.tsx#L94-L113](../../apps/web/src/app/teams/page.tsx#L94-L113)) instead of
`fieldInputClass` / the shared select recipe. (The Search button is already
canonical.) **Recommended fix:** input → `fieldInputClass`, select → the shared
field-select class, with `sm:items-center` on the row so the label-oriented
`mt-1` aligns (as in the PL-3/G-3 fixes). Cross-ref persona-ux **CC-2**.

#### TM-3 — No result count on the Discover section · **P3** (PL-4/G-4 analog)

The discover query returns `discoverTotal`
([page.tsx#L63-L65](../../apps/web/src/app/teams/page.tsx#L63-L65)) but the
"Discover teams" header never shows it — unlike the `Players · {total}` /
`Groups · {total}` counts just added. **Recommended fix:** show the count on the
"Discover teams" subhead (e.g. "Discover teams · {total}").

#### TM-4 — The discover read is a raw inline query, not behind a read-side port · **P3** (consistency / architecture)

`/players` and `/groups` read their directories through `ProfileQueries.searchDirectory`
/ `GroupQueries.searchDirectory` (read-side ports, architecture P2-1), but the
teams discover listing issues a raw `supabase.from('teams').select(...)` **inline
in the page** ([page.tsx#L54-L71](../../apps/web/src/app/teams/page.tsx#L54-L71)),
including the captain-name resolution. It works, but it's the odd one out and has
no test seam — and it's the natural home for the TM-1 roster-count logic.
**Recommended fix (optional, architecture-flavored):** extract a
`TeamQueries.searchDirectory` port + Supabase adapter (mirroring the other two),
moving the team query + captain hydration + TM-1 roster counts off the page. P3 —
lighter alternative is to keep it inline and just add the count there; flagged so
the inconsistency is on record.

---

## Out of scope

- **`MyTeamsPanel`** internals (captained/rostered/pending sections) and the
  **`/teams/[id]`** team page are distinct surfaces — their own pass if needed.
  This file covers the page's **discover directory** + page-level structure.

## Remediation log

_None yet — findings pass only (2026-06-01). Update this section with a dated
entry when a bundle lands, per [README.md](README.md)._
