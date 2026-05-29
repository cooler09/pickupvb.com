-- ============================================================================
-- Drop legacy `team_*_id` columns from `bracket_seeds` + `bracket_matches`
-- now that every persisted participant pointer lives on `entry_*_id`. See
-- docs/audits/event-data-model.md — closes the soak-period cleanup
-- follow-up. Pre-launch posture: destructive drop is acceptable.
--
-- Context: 20260809..20260811000100 added `entry_*_id` columns alongside
-- the legacy `team_*_id` columns and the final backfill
-- (`20260811000100_backfill_bracket_entry_ids.sql`) atomically rewrote
-- every populated legacy id into the matching entry column and nulled
-- the team column. The application read path was extended in the
-- 2026-12-04 cutover to prefer `entry_*_id` and fall back to
-- `team_*_id`; the write path was flipped onto `entry_*_id` only.
-- Post-cutover, every row is exclusively keyed via the entry columns
-- and the fallback is dead code.
--
-- This migration removes:
--   * `bracket_seeds.team_id` — column, the partial unique index that
--     covered it, the `bracket_seeds_team_or_entry` exactly-one check,
--     and the auto-generated FK → `teams(id)`.
--   * `bracket_matches.{team_a_id, team_b_id, winner_team_id,
--     work_team_id}` — columns, FKs → `teams(id)`, the supporting
--     indexes that solely covered them, and the four
--     `bracket_matches_team_xor_*` at-most-one polymorphic checks.
--   * The `is_bracket_match_captain` helper joins captains through
--     `bracket_matches.team_a_id` / `team_b_id` → `teams.captain_id`.
--     Rewritten to resolve captain identity through
--     `event_team_entries.captain_id` via `entry_a_id` / `entry_b_id`.
--     Walk-in entries have `captain_id IS NULL`, so they correctly
--     never grant captain affordances — only host updates apply.
--
-- Post-migration: `bracket_seeds.entry_id` becomes NOT NULL (the
-- exactly-one check already enforced that one of the pair be set; with
-- `team_id` gone, `entry_id` is the sole identifier). The existing
-- partial unique on `(bracket_id, entry_id) WHERE entry_id IS NOT NULL`
-- now covers every row; the predicate stays as a no-op rather than
-- rewriting the index just to drop the WHERE clause.
-- ============================================================================

-- 1. bracket_seeds: drop check + partial unique BEFORE dropping the column
--    so the DROP COLUMN doesn't error on dependent objects.
alter table public.bracket_seeds
    drop constraint if exists bracket_seeds_team_or_entry;

drop index if exists public.bracket_seeds_bracket_team_uidx;

alter table public.bracket_seeds
    drop column if exists team_id;

alter table public.bracket_seeds
    alter column entry_id set not null;

-- 2. bracket_matches: drop polymorphic check constraints first. They
--    reference both `team_*_id` and `entry_*_id` columns; the DROP COLUMN
--    below would otherwise fail on the multi-column predicates.
alter table public.bracket_matches
    drop constraint if exists bracket_matches_team_xor_entry_a,
    drop constraint if exists bracket_matches_team_xor_entry_b,
    drop constraint if exists bracket_matches_team_xor_winner_entry,
    drop constraint if exists bracket_matches_team_xor_work_entry;

-- 3. bracket_matches: drop columns. FK constraints + supporting indexes
--    (bracket_matches_team_a_idx / team_b_idx / work_team_idx — no
--    standalone index on winner_team_id) auto-drop with their columns.
alter table public.bracket_matches
    drop column if exists team_a_id,
    drop column if exists team_b_id,
    drop column if exists winner_team_id,
    drop column if exists work_team_id;

-- 4. Rewrite is_bracket_match_captain to resolve captains through
--    event_team_entries. Same security posture as the original
--    (SECURITY DEFINER); same call sites in RLS policies on
--    bracket_matches + bracket_match_sets.
create or replace function public.is_bracket_match_captain(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
          from public.bracket_matches m
          left join public.event_team_entries a on a.id = m.entry_a_id
          left join public.event_team_entries b on b.id = m.entry_b_id
         where m.id = p_match_id
           and (a.captain_id = auth.uid() or b.captain_id = auth.uid())
    );
$$;
