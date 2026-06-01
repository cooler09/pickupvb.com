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

> **Status update (2026-06-01):** Full persona-lens evaluation; **all four
> findings (TM-1…TM-4) shipped the same day.** No P1, no P2 — a well-built page
> that got polish + convergence: TM-1 a **"N/size · Recruiting / Full"** roster
> chip on the discover card; TM-2 search input + format select →
> `fieldInputClass`; TM-3 a "Discover teams · {total}" count; TM-4 the inline
> discover query extracted into a **`TeamQueries.searchDirectory`** port +
> `SupabaseTeamQueryRepository` (mirroring `ProfileQueries`/`GroupQueries`), which
> is where TM-1's roster + captain hydration now live. The three Connect
> directories now read through parallel read-side ports. **No follow/join-from-
> directory finding** — team rosters are captain-invite-only.
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

#### TM-1 — Discover cards don't show roster size / "recruiting vs full" · **P3** · ✅ resolved 2026-06-01

The discover `TeamCard` shows name + format + captain
([team-card.tsx#L38-L44](../../apps/web/src/app/teams/_components/team-card.tsx#L38-L44)),
but not **how full the roster is** — the single most useful signal for a player
scanning for a team to join or a captain sizing up the field. A doubles team with
1 player is recruiting; a quad with 4 is full. The data is available and
anon-safe: `team_members` (RLS `using (true)`) for the active roster,
`teams.extra_member_count` for off-site players, and the `format` enum for the
target size (doubles=2, triples=3, quads=4, sixes=6).

**Fix (done):** the new `TeamQueries.searchDirectory` (TM-4) projects
`rosterCount` (active `team_members` count, anon-safe, + `extra_member_count`) and
`teamSize` (via the domain `playersPerSide(format)`) per card. `TeamCard` gained
optional `rosterCount`/`teamSize` props and renders a chip — **"3/4 ·
Recruiting"** (emerald) while `rosterCount < teamSize`, else **"Full"** (muted).
The role badge is unchanged; the My-teams panel can opt into the chip later.
[team-card.tsx](../../apps/web/src/app/teams/_components/team-card.tsx),
[supabase-team-query-repository.ts](../../packages/infrastructure/src/supabase-team-query-repository.ts).

### B. Consistency / convergence

#### TM-2 — Search input + format select bypass the shared field vocabulary · **P3** (PL-3/G-3 analog) · ✅ resolved 2026-06-01

The search input and the format `<select>` hand-roll `border-border-base
bg-surface rounded-md border px-3 py-2 text-sm`
([page.tsx#L94-L113](../../apps/web/src/app/teams/page.tsx#L94-L113)) instead of
`fieldInputClass` / the shared select recipe. (The Search button is already
canonical.) **Fix (done):** both the input **and** the format `<select>` now use
`fieldInputClass` (a select takes the same chassis cleanly), with `sm:items-center`
on the row so the label-oriented `mt-1` aligns. Cross-ref persona-ux **CC-2**.
[teams/page.tsx](../../apps/web/src/app/teams/page.tsx).

#### TM-3 — No result count on the Discover section · **P3** (PL-4/G-4 analog) · ✅ resolved 2026-06-01

The discover query returns `discoverTotal`
([page.tsx#L63-L65](../../apps/web/src/app/teams/page.tsx#L63-L65)) but the
"Discover teams" header never shows it — unlike the `Players · {total}` /
`Groups · {total}` counts just added. **Fix (done):** the "Discover teams"
header now reads "Discover teams · {total}".
[teams/page.tsx](../../apps/web/src/app/teams/page.tsx).

#### TM-4 — The discover read is a raw inline query, not behind a read-side port · **P3** (consistency / architecture) · ✅ resolved 2026-06-01

`/players` and `/groups` read their directories through `ProfileQueries.searchDirectory`
/ `GroupQueries.searchDirectory` (read-side ports, architecture P2-1), but the
teams discover listing issues a raw `supabase.from('teams').select(...)` **inline
in the page** ([page.tsx#L54-L71](../../apps/web/src/app/teams/page.tsx#L54-L71)),
including the captain-name resolution. It works, but it's the odd one out and has
no test seam — and it's the natural home for the TM-1 roster-count logic.
**Fix (done):** extracted a `TeamQueries.searchDirectory` port
([team-queries.ts](../../packages/domain/src/teams/team-queries.ts)) + a
`SupabaseTeamQueryRepository` adapter
([supabase-team-query-repository.ts](../../packages/infrastructure/src/supabase-team-query-repository.ts))
mirroring `ProfileQueries`/`GroupQueries` — the team query, captain-name
hydration (adapter-composes-`SupabaseProfileRepository`), and TM-1 roster counts
all moved off the page. The page now calls `new SupabaseTeamQueryRepository(supabase).searchDirectory(...)`
([teams/page.tsx](../../apps/web/src/app/teams/page.tsx)), shedding its inline
`supabase.from('teams')` query + `SupabaseProfileRepository` import. The three
directories now read through parallel read-side ports.

---

## Out of scope

- **`MyTeamsPanel`** internals (captained/rostered/pending sections) and the
  **`/teams/[id]`** team page are distinct surfaces — their own pass if needed.
  This file covers the page's **discover directory** + page-level structure.

## Remediation log

### 2026-06-01 — TM-1…TM-4 bundle (roster signal + vocab + count + read-side port)

Shipped all four findings the same day. Verified `pnpm typecheck && lint && test
&& build` (all green; one mid-build typecheck fix — `.eq('format', format as
Format)` — since `TeamDirectoryQuery.format` is a plain `string` at the port
boundary but the column is the format enum). Journal:
[2026-06-01-teams-directory.md](../journal/2026-06-01-teams-directory.md).

- **TM-4 ✅** — new `TeamQueries.searchDirectory` port
  ([team-queries.ts](../../packages/domain/src/teams/team-queries.ts)) +
  `SupabaseTeamQueryRepository`
  ([supabase-team-query-repository.ts](../../packages/infrastructure/src/supabase-team-query-repository.ts));
  the page sheds its inline query + `SupabaseProfileRepository` import.
- **TM-1 ✅** — `TeamDirectoryCard.rosterCount`/`teamSize` (active `team_members`
  count + `extra_member_count`; `playersPerSide(format)`); `TeamCard` renders a
  "N/size · Recruiting" / "Full" chip.
- **TM-2 ✅** — search input + format select → `fieldInputClass`, row `sm:items-center`.
- **TM-3 ✅** — "Discover teams · {total}" header count.

_All findings resolved. The three Connect directories (`/players`, `/groups`,
`/teams`) now share the read-side-port + card-signal + (where applicable)
follow-island patterns. Re-audit if the page changes materially._
