# League play keys on entry id (ADR 0033 Phase 4 / ADR 0034) (2026-06-03)

The capstone of the host-managed-teams initiative: host-added (account-less)
league teams are now **first-class league participants** — schedulable,
scorable, and forfeitable — not just registration/payment rows. Full decision in
[ADR 0034](../adr/0034-league-play-on-entry-id.md).

## Why

ADR 0033 Phase 2 let a league host add team-less `walk_in` entries
(`event_team_entries`, `team_id = null`). But league play was keyed on
`teams.id` (`league_schedule_matches.home_team_id` / `away_team_id`), so those
teams were silently pruned from the schedule — registerable + payable but not
playable. Brackets had already moved to `event_team_entries.id`; leagues were the
last `teams.id`-keyed surface. This bundle finishes the cutover.

## Scope turned out smaller than feared

Three things kept it bounded:

- `record_league_match_result` is **score-only** (`match_id` + scores) — untouched.
- **No league standings exist yet** (the schedule UI shows matches + scores, not
  W-L) — nothing to migrate; when standings land they group by `entry_id`.
- `bracketRepo.listRegisteredTeams` **already returns `entryId`** for every
  source and already lists team-less entries — the schedule page just discarded
  them. So the loader side was a one-line "stop pruning."

## Changes

- **Migration** [20260910000000_league_play_on_entry_id.sql](../../supabase/migrations/20260910000000_league_play_on_entry_id.sql)
  — `league_schedule_matches` gains `home_entry_id` / `away_entry_id` (FK →
  `event_team_entries`), backfilled from each referenced team's live roster entry
  in the match division, then drops `home_team_id` / `away_team_id`. Reframes the
  distinct-competitors CHECK, rewrites `is_league_match_captain` to resolve the
  captain via `event_team_entries.captain_id`, and rewrites `save_league_schedule`
  to the entry columns. Direct cutover (not the bracket's transitional
  polymorphic pair) — leagues only ever had roster entries, so the backfill is
  total.
- **Domain** [league-schedule.ts](../../packages/domain/src/leagues/league-schedule.ts)
  — `LeagueScheduleMatch.homeTeamId/awayTeamId` → `homeEntryId/awayEntryId: EntryId`.
- **Forfeit** — port `setRosterTeamForfeited(divisionId, teamId)` →
  `setLeagueEntryForfeited(entryId)` (looks up by entry id, dropping the
  `source='roster'` filter so host-added entries forfeit too); command field
  `teamId` → `entryId`.
- **Infra** [supabase-league-schedule-repository.ts](../../packages/infrastructure/src/supabase-league-schedule-repository.ts)
  — local `MatchRow` + `MATCH_COLUMNS` + save payload to entry ids. (The repo
  uses local Row types + string selects + `as never`, so it's decoupled from the
  generated `Database` types — typecheck passed without regenerating them.)
- **App + UI** — `league-schedule.handler.ts` (`ScheduleMatchInput`),
  `schedule/actions.ts` (form fields `homeEntryId`/`awayEntryId`),
  `schedule/_components/match-row.tsx` (`ScheduleTeam.entryId`, the picker),
  `schedule/page.tsx` (lists **all** entries, maps the match VM),
  `_loaders/load-event-detail.ts` (`LeagueTeamView.entryId`,
  `loadLeagueTeamsByDivision` now lists roster **and** host-added entries via
  `display_name`, no `teams` join), `league-teams-panel.tsx` + `league-team-actions.ts`
  (forfeit by entry id).
- **Tests** — domain `league-schedule.test.ts`, app `league-schedule.handler.test.ts`
  - `league-roster.handler.test.ts` flipped to entry ids; e2e
    `league.authed.spec.ts` + the `createLeagueFixture` helper now capture and use
    the `event_team_entries.id` (added `LeagueTeamRef.entryId`).

Quad-green: typecheck 15/15, lint 15/15, tests 482 domain + 48 infra + 115 app +
214 web, build 8/8.

## Patterns observed

- **A short brand substring can ride a rename.** `homeTeamId` contains `TeamId`,
  so a `TeamId`→`EntryId` `replace_all` in the domain/handler tests converted the
  field names for free. Convenient, but worth eyeballing — a careless `replace_all`
  on a substring like this is exactly how unrelated identifiers get clobbered.
- **The captain resolves to null for host-added matches**, so `is_league_match_captain`
  returns false and only the host can record a walk-in team's result. That's the
  correct consequence of "no account behind the team," not a bug.

## Follow-ups

- **Migration not applied locally** (Docker). Apply + `pnpm --filter
@pickupvb/supabase gen:types` when available so the generated types catch up
  (they still name the dropped columns; nothing reads them through the generated
  types, so typecheck/build are unaffected). CI applies it on deploy.
- **e2e is authored, not run** (deploy-gated, Node-22 + cleanup creds). The
  schedule spec + fixture were updated to entry ids but must be run green against
  dev before trusting — the option values changed from team ids to entry ids.
- League **standings** still don't exist; when built, group by `entry_id`.
- Initiative is now feature-complete (Phases 1–4); Phase 3 (captain-claim UI for
  a host-added team, ADR 0017 §7) remains the only deferred piece.
