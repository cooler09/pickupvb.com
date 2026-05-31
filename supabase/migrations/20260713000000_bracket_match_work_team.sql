-- ============================================================================
-- Bracket matches: work / ref team per match. See docs/adr/0018-pool-play-configuration.md.
--
-- Context: ADR 0018 Phase 2. Local-league convention is that the idle team in
-- a pool refs the current match. Until now the bracket had no slot for that;
-- hosts tracked it on paper. The Phase 1 commit (bundle 122) shipped the
-- pool-play config knobs (bestOf, schedule mode); this migration adds the
-- column the generator and UI both need to record the assignment, plus a
-- BracketConfig `requireWorkTeam` flag (stored in the existing JSON `config`
-- column on `tournament_brackets`, so no schema change there).
--
-- Impact: additive. `work_team_id` is nullable — existing rows stay valid and
-- the column reads as `null` until a fresh `Bracket.generate()` populates it
-- (or a host edits a match manually). FK uses `on delete set null` so removing
-- a team doesn't cascade-delete the match row. No backfill: pre-existing
-- brackets continue to operate without an assigned work team; only newly
-- generated pool-play brackets with `requireWorkTeam = true` will have non-null
-- values. RLS unchanged — viewers who can see a bracket match can see the
-- work team field, same as `team_a_id`/`team_b_id`.
-- ============================================================================

alter table public.bracket_matches
    add column if not exists work_team_id uuid
        references public.teams(id) on delete set null;

create index if not exists bracket_matches_work_team_idx
    on public.bracket_matches (work_team_id);
