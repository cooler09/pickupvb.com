# 0034. League play keys on `event_team_entries.id`, not `teams.id`

- **Status:** Accepted
- **Date:** 2026-06-03
- **Completes:** [ADR 0033 — Host-managed, account-less team entries](0033-host-managed-account-less-team-entries.md) (Phase 4)
- **Mirrors:** the bracket cutover to entry ids
  ([20260809000000_bracket_matches_entry_id_columns.sql](../../supabase/migrations/20260809000000_bracket_matches_entry_id_columns.sql),
  `winner_entry_id` in the collapse migration).

## Context

ADR 0033 let a league host add account-less teams as team-less `walk_in`
entries (`event_team_entries`, `team_id = null`). But **league play is keyed on
`teams.id`**:

- `league_schedule_matches.home_team_id` / `away_team_id` are FKs → `teams.id`
  ([20260803000000](../../supabase/migrations/20260803000000_league_schedule_matches.sql)).
- The captain-update RLS helper `is_league_match_captain` joins `teams` on those
  columns.
- Forfeit (`setRosterTeamForfeited(divisionId, teamId)`) looks up
  `event_team_entries` by `team_id` + `source='roster'`.
- The schedule page prunes team-less entries:
  `allEntries.flatMap(t => t.teamId ? … : [])`.

So a host-added team can be **registered and marked paid** but **cannot be
scheduled, scored, or forfeited** — it has no `teams.id`. For a league that is
mostly off-platform registrations (the common case ADR 0033 targets), the league
schedule would be nearly empty. This finding is the real blocker behind the
ADR 0033 Phase-2 follow-ups.

Brackets already solved the identical problem: the 2026 collapse + bracket
cutover moved bracket wiring onto `event_team_entries.id` (`entry_a_id`,
`entry_b_id`, `winner_entry_id`), so ad-hoc / walk-in entries are first-class in
brackets. Leagues are the remaining `teams.id`-keyed surface.

## Decision

**Move league play onto `event_team_entries.id`.** The entry `id` is the single
team identity across the whole product (brackets already use it); leagues join it.

What the cutover touches and — importantly — what it doesn't:

1. **`league_schedule_matches`** — replace `home_team_id` / `away_team_id`
   (FK `teams.id`) with `home_entry_id` / `away_entry_id` (FK
   `event_team_entries.id`, `on delete set null`). Backfill from the roster
   entry of each referenced team in the match's division, then drop the team
   columns. Direct cutover (not the bracket's transitional polymorphic pair):
   leagues only ever had roster entries pre-Phase-2, so the backfill is total
   and a parallel-column phase buys nothing.
2. **`is_league_match_captain`** — resolve the captain via
   `event_team_entries.captain_id` joined on the new entry columns (roster
   entries carry the team captain's id; `walk_in` entries have `captain_id null`
   → no captain self-report, host-only, which is correct).
3. **`save_league_schedule` RPC** — read/write `home_entry_id` / `away_entry_id`
   from the match payload.
4. **Domain** — `LeagueScheduleMatch.homeTeamId/awayTeamId: TeamId` →
   `homeEntryId/awayEntryId: EntryId`. The only team invariant ("home ≠ away")
   carries over unchanged.
5. **Forfeit** — `setRosterTeamForfeited(divisionId, teamId)` →
   `setLeagueEntryForfeited(entryId)`; lookup by entry id, dropping the
   `source='roster'` filter so host-added entries forfeit too. `forfeited_at`
   already lives on `event_team_entries`.
6. **Schedule UI + loader** — the team picker and match view key on `entryId`;
   the loader includes team-less entries (no `team_id` prune); `LeagueTeamView`
   gains `entryId`.

**No change** to:

- `record_league_match_result` — it's score-only (`match_id`, scores); no team
  refs.
- League **standings** — none exist yet (the schedule UI shows matches + scores,
  not W-L). When standings land they group by `entry_id` from the start.
- The `teams` table, the persistent `Team` aggregate, or the roster
  self-registration path. Roster entries keep their `team_id`; only league
  _match wiring_ stops dereferencing it.

## Consequences

**Easier.**

- Host-added league teams become first-class: schedulable, scorable,
  forfeitable — completing the ADR 0033 promise.
- One team identity (`entry_id`) across brackets **and** leagues; readers stop
  branching on "roster vs. ad-hoc/walk-in."
- The schedule page's team-less prune (and its now-stale guard comment)
  disappears.

**Harder / watch.**

- It's a destructive migration (drops `home_team_id`/`away_team_id`). Acceptable
  pre-launch with a total backfill, the same posture as the collapse migration.
  A withdrawn roster team (`deleted_at` set) referenced by an old match backfills
  to `null` — correct (it shouldn't be in the schedule), but a behavior change
  from the old `teams` join that still rendered the name.
- `is_league_match_captain` now returns false for `walk_in` matches (no captain),
  so host-added teams can't self-report scores — only the host can. Intended:
  there's no account behind a host-added team.

## Alternatives considered

- **Create a persistent `Team` per host-added league team** (captain = host) so
  `teams.id` works. Rejected: the host would captain every team, the `Team`
  "captain is an active member" invariant pollutes rosters, and it diverges from
  the tournament `walk_in` model and ADR 0033. Entry-id is the identity we
  already committed to for brackets.
- **Parallel team/entry columns (the bracket transitional approach).** Rejected
  for leagues: there's no incremental-cutover pressure (one writer, total
  backfill), so a direct swap is cleaner than carrying a polymorphic pair + XOR
  constraint.

## Related

- [ADR 0033](0033-host-managed-account-less-team-entries.md),
  [ADR 0023 — Live match scoring](0023-live-match-scoring.md) (scoreboard ↔
  league match; score-only RPC unaffected).
- Migration: [20260803000000_league_schedule_matches.sql](../../supabase/migrations/20260803000000_league_schedule_matches.sql) (original),
  [20260812000000_save_league_schedule_rpc.sql](../../supabase/migrations/20260812000000_save_league_schedule_rpc.sql).
- Domain: [league-schedule.ts](../../packages/domain/src/leagues/league-schedule.ts).
