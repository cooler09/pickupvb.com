-- ============================================================================
-- Bracket matches: add `work_entry_id` column alongside `work_team_id` so the
-- pool-play work / ref slot can hold either a roster `teams.id` or an ad-hoc
-- `event_team_entries.id`. Completes the polymorphic pair coverage started by
-- 20260809000000_bracket_matches_entry_id_columns.sql.
--
-- Context: the matches bundle (A/B/winner) and seeds bundle landed
-- `entry_*_id` parallel columns, but the work-team slot was deferred. That
-- deferral has now blocked the match write-path cutover: after the cutover,
-- generators stamp `workTeamId` from values that live in `bracket_seeds`,
-- which (post-cutover) hold `event_team_entries.id` values. Writing those
-- into `work_team_id` (FK → teams.id) fails. This migration adds the
-- entry-side counterpart so the same generator output can be persisted.
--
-- Impact: additive. `work_entry_id` is nullable and unused until callers
-- start writing it. Existing rows with `work_team_id` set stay valid (the
-- new check constraint is at-most-one, not exactly-one — same shape as the
-- A/B/winner polymorphic pairs added in the matches bundle). No backfill —
-- on the next `Bracket` save the repo will delete+reinsert match rows with
-- `work_entry_id` populated. The application layer half of this cutover
-- lands in the same change-bundle as this migration.
-- ============================================================================

alter table public.bracket_matches
    add column work_entry_id uuid references public.event_team_entries(id) on delete set null;

create index bracket_matches_work_entry_idx
    on public.bracket_matches (work_entry_id);

alter table public.bracket_matches
    add constraint bracket_matches_team_xor_work_entry
        check (work_team_id is null or work_entry_id is null);
