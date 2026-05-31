# 2026-12-04 — Bracket matches + seeds + work-team write-path cutover

## Why

Closes the application half of the carry-over `event-data-model.md`
filter-loosening line. After the three groundwork migrations (entry
columns on `bracket_matches` + `bracket_seeds`, and the read-side
filter/projection flip in the bracket-reader bundle) the bracket write
path was the last consumer still emitting `team_*_id` payloads — which
meant `event_team_entries`-only rows (ad-hoc + walk-in) still couldn't
be seeded into a bracket. This bundle flips writes onto the polymorphic
`entry_*_id` columns so the schema is ready for the
`.not('team_id', 'is', null)` filter drop.

## Scope expansion (this is the interesting part)

Started as a match-only cutover. While walking the call graph it became
clear matches / seeds / work-team are inseparable:

1. `generatePoolPlay` and friends copy `seed.teamId` straight into the
   new `match.entryAId` slot. If seeds keep writing `team_id` but
   matches start writing `entry_a_id`, the new at-most-one polymorphic
   check on `bracket_matches` fires immediately at insert time — the
   payload carries a `teams.id` value into a column FK'd to
   `event_team_entries.id`.
2. `assignIdleWorkTeams` stamps `workTeamId` from the pool seeds. Same
   coupling — the work-team value comes from the same pool of ids.
   `bracket_matches.work_team_id` (FK → `teams.id`) would break the
   moment seeds carried entry-ids.

So one of:

- A: flip everything together (this bundle).
- B: keep `Match.workTeamId` on `team_id` and add an `entry_id` shadow
  later. Doubles the polymorphic surface to maintain.

A wins. The user explicitly picked the combined sweep with a new
`work_entry_id` column.

## What landed

### Domain

- New `EntryId` brand in `match.ts`. Separate from `TeamId` —
  `event_team_entries.id` is structurally a different namespace, even
  though it's a uuid like everything else. Branding it forces a
  conscious cast at the boundary.
- `Match.teamAId` / `teamBId` / `winnerTeamId` →
  `entryAId` / `entryBId` / `winnerEntryId`. Type `EntryId | null`.
- `Match.workTeamId` field name **kept**; type retyped to
  `EntryId | null`. Renaming the field would have rippled through every
  generator function, the test fixtures, the standings module, and the
  UI for zero behavioural gain. Docstring calls out the lie and lists
  it as a follow-up cleanup.
- `Seed.teamId` and `PoolStanding.teamId` field names also kept,
  retyped to `EntryId`. Same reasoning. Promoted to a follow-up.
- `MatchResultRecorded.winnerTeamId` → `winnerEntryId` on the event
  payload (no event replayers downstream — verified with grep).

### Schema

- `20260811000000_bracket_matches_work_entry_id.sql` — new column,
  FK, index, at-most-one polymorphic check
  (`work_team_id is null or work_entry_id is null`). Mirrors the
  pattern of the earlier `entry_a_id` / `entry_b_id` /
  `winner_entry_id` migration.
- `20260811000100_backfill_bracket_entry_ids.sql` — atomic backfill.
  Five UPDATEs (four match slots, one seed), each one resolves
  `event_team_entries.id` by joining through
  `bracket_matches → event_brackets → event_team_entries` on
  `(division_id, team_id)`, then sets `entry_*_id` and nulls
  `team_*_id` in the same statement so the at-most-one check is
  satisfied at every intermediate state.

### Infra

`SupabaseBracketRepository`:

- Reads prefer `entry_*_id`, fall back to `team_*_id` — covers rows
  that the backfill couldn't resolve (e.g. an orphaned reference where
  the entry row was deleted between persist and read). Returns
  whichever id is present, cast as `EntryId`. The dual-keyed UI map
  picks up either variant.
- Writes drop the `team_*_id` columns from both seed and match insert
  payloads entirely. Going forward those columns only contain
  null-by-omission values.

Types stub gained `work_team_id` (it was actually missing!) + the new
`work_entry_id` Row/Insert/Update fields and the matching
`bracket_matches_work_entry_id_fkey` relationship entry.

### Web

The interesting trick: instead of touching every match-card / standings
/ board-view consumer to thread through both `teamId` and `entryId`
lookups, both bracket pages (`bracket/page.tsx` and `bracket/watch/page.tsx`)
build a **dual-keyed** `teamById` map. Each `BracketTeamLite` is
inserted under both its `teamId` and its `entryId`. Downstream lookups
are unchanged — they stringify whichever id the underlying data carries
and hit the right row either way. Costs one extra Map.set per team.

Match-card and OG image got the `Match` field renames; board-view's one
filter on `m.teamAId && m.teamBId` got the same treatment.

## Follow-ups I'm leaving for the next agent

1. Drop the `.not('team_id', 'is', null)` filter from
   `listRegisteredTeams` and project ad-hoc / walk-in entries (which
   have no `teams` row) through a different name source — probably
   the `event_team_entries.display_name` column. That's the
   user-visible payoff for the entire entry-id arc.
2. Rename `Seed.teamId` / `PoolStanding.teamId` to `entryId`. Pure
   cleanup. Mechanical, but touches every standings call site.
3. Cleanup migration drops the legacy `team_*_id` columns from both
   `bracket_seeds` and `bracket_matches` after a soak period. At that
   point the hydrate-path fallback in `SupabaseBracketRepository` also
   comes out.

## Patterns worth remembering

- **Dual-keyed lookup maps are the right escape hatch for polymorphic
  id migrations.** Splitting consumers into "this one wants entryId"
  and "this one wants teamId" creates a churn surface 10–20× larger
  than the actual cutover.
- **Backfill UPDATEs must satisfy at-most-one polymorphic checks at
  every intermediate state.** Set the new column and null the old one
  in the same statement, not in two passes.
- **Don't rename fields just because the type changed.** `workTeamId`
  carrying an `EntryId` is a lie, but a one-line docstring lie is
  cheaper than a 50-file rename, and the cleanup can ride on the next
  pass.
