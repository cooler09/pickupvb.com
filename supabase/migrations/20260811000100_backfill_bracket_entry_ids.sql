-- ============================================================================
-- Backfill `bracket_matches.entry_*_id` and `bracket_seeds.entry_id` from
-- their legacy `team_*_id` counterparts, then null the team columns.
--
-- Companion to:
--   - 20260809000000_bracket_matches_entry_id_columns.sql (entry_a/b/winner)
--   - 20260810000000_bracket_seeds_entry_id_column.sql    (entry_id)
--   - 20260811000000_bracket_matches_work_entry_id.sql    (work_entry_id)
--
-- Context: the three groundwork migrations above intentionally skipped
-- backfill because the at-most-one polymorphic check would reject any
-- row with both id variants populated, and the app still wrote `team_*_id`
-- at the time. The application-layer cutover that flips writes to
-- `entry_*_id` lands in the same change-bundle as this migration; this
-- backfill brings already-persisted rows along so the hydrate path can
-- read uniformly from `entry_*_id` instead of falling back to `team_*_id`.
--
-- For each non-null team column we resolve the participant's
-- `event_team_entries.id` via the bracket's division (entries are
-- scoped per division), set the entry column, then null the team
-- column atomically (so the at-most-one check is satisfied at every
-- intermediate state).
--
-- Impact: data-only. No schema changes. After this migration runs,
-- `bracket_matches.team_*_id` and `bracket_seeds.team_id` should be null
-- on every row that the app touches; the columns stay on the table for
-- one more cleanup migration that drops them after a soak period.
-- ============================================================================

-- 1. bracket_matches slots (A, B, winner, work)
--
-- Postgres forbids referencing the UPDATE target (`m`) from inside a
-- FROM-clause JOIN's ON. Use comma-separated FROM tables and put the
-- cross-table predicates in WHERE instead. `source='roster'` +
-- `deleted_at is null` mirror the filters used by the original
-- (later-removed) backfills in 20260809/20260810.
update public.bracket_matches m
   set entry_a_id = e.id,
       team_a_id  = null
  from public.event_brackets b,
       public.event_team_entries e
 where b.id = m.bracket_id
   and m.team_a_id is not null
   and e.division_id = b.division_id
   and e.source = 'roster'
   and e.deleted_at is null
   and e.team_id = m.team_a_id;

update public.bracket_matches m
   set entry_b_id = e.id,
       team_b_id  = null
  from public.event_brackets b,
       public.event_team_entries e
 where b.id = m.bracket_id
   and m.team_b_id is not null
   and e.division_id = b.division_id
   and e.source = 'roster'
   and e.deleted_at is null
   and e.team_id = m.team_b_id;

update public.bracket_matches m
   set winner_entry_id = e.id,
       winner_team_id  = null
  from public.event_brackets b,
       public.event_team_entries e
 where b.id = m.bracket_id
   and m.winner_team_id is not null
   and e.division_id = b.division_id
   and e.source = 'roster'
   and e.deleted_at is null
   and e.team_id = m.winner_team_id;

update public.bracket_matches m
   set work_entry_id = e.id,
       work_team_id  = null
  from public.event_brackets b,
       public.event_team_entries e
 where b.id = m.bracket_id
   and m.work_team_id is not null
   and e.division_id = b.division_id
   and e.source = 'roster'
   and e.deleted_at is null
   and e.team_id = m.work_team_id;

-- 2. bracket_seeds
update public.bracket_seeds s
   set entry_id = e.id,
       team_id  = null
  from public.event_brackets b,
       public.event_team_entries e
 where b.id = s.bracket_id
   and s.team_id is not null
   and e.division_id = b.division_id
   and e.source = 'roster'
   and e.deleted_at is null
   and e.team_id = s.team_id;
