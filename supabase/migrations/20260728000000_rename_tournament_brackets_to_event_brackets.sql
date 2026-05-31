-- ============================================================================
-- Rename `tournament_brackets` → `event_brackets`.
-- See docs/audits/event-data-model.md § P2 #6.
--
-- Context: leagues (P1 #1, upcoming) reuse the same per-division bracket
-- row for their end-of-season playoff. `tournament_brackets` is the wrong
-- noun once leagues land. Pre-launch is the destructive window — this is a
-- pure rename (table + indexes + constraints + RLS policies + publication
-- membership) with zero data churn.
--
-- Impact: every code site that read/wrote `public.tournament_brackets`
-- must switch to `public.event_brackets` in the same PR. Generated
-- `database.types.ts` is regenerated; domain repo string literals + the
-- Realtime subscription channel filter both flip in this bundle.
-- ============================================================================

-- 1. Table rename
alter table public.tournament_brackets rename to event_brackets;

-- 2. Index renames (Postgres does not auto-rename indexes when the table
--    moves, and several callers reference these names indirectly via the
--    bracket-per-division migration's `if not exists` guards).
alter index if exists tournament_brackets_event_idx       rename to event_brackets_event_idx;
alter index if exists tournament_brackets_division_uidx   rename to event_brackets_division_uidx;
alter index if exists tournament_brackets_division_idx    rename to event_brackets_division_idx;

-- 3. FK constraint renames on child tables (auto-generated names follow
--    `<table>_<column>_fkey` — but the originating column lived on the
--    old name, so the constraint name still encodes `tournament_brackets`
--    referencing relations until we rename it).
alter table public.event_brackets
  rename constraint tournament_brackets_event_id_fkey to event_brackets_event_id_fkey;
alter table public.event_brackets
  rename constraint tournament_brackets_division_id_fkey to event_brackets_division_id_fkey;
alter table public.event_brackets
  rename constraint tournament_brackets_pkey to event_brackets_pkey;

-- 4. RLS policy renames.
alter policy tournament_brackets_select on public.event_brackets rename to event_brackets_select;
alter policy tournament_brackets_insert on public.event_brackets rename to event_brackets_insert;
alter policy tournament_brackets_update on public.event_brackets rename to event_brackets_update;
alter policy tournament_brackets_delete on public.event_brackets rename to event_brackets_delete;

-- 5. Realtime publication: drop + add under the new name. Idempotent guard
--    mirrors the pattern from 20260704000000_bracket_realtime so the
--    migration is safe to re-run in any environment.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename  = 'tournament_brackets'
  ) then
    alter publication supabase_realtime drop table public.tournament_brackets;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename  = 'event_brackets'
  ) then
    alter publication supabase_realtime add table public.event_brackets;
  end if;
end $$;
