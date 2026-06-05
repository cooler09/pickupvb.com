-- ============================================================================
-- ADR 0034 — League play keys on `event_team_entries.id`, not `teams.id`.
-- See docs/adr/0034-league-play-on-entry-id.md
--
-- Context: ADR 0033 lets a league host add account-less teams as team-less
-- `walk_in` entries (event_team_entries, team_id null). But league match wiring
-- is keyed on `teams.id` (league_schedule_matches.home_team_id / away_team_id,
-- FK -> teams.id; the captain RLS helper joins teams), so host-added teams can
-- be registered + marked paid but cannot be scheduled, scored, or forfeited.
-- Brackets already moved match wiring onto event_team_entries.id (entry_a_id /
-- entry_b_id / winner_entry_id); leagues are the last teams.id-keyed surface.
--
-- Impact: cutover (destructive, pre-launch). league_schedule_matches gains
-- home_entry_id / away_entry_id (FK -> event_team_entries.id, on delete set
-- null), backfilled from the live roster entry of each referenced team in the
-- match's division, then the home_team_id / away_team_id columns + indexes are
-- dropped. The distinct-teams CHECK is reframed on entry ids. The captain RLS
-- helper `is_league_match_captain` resolves the captain via
-- event_team_entries.captain_id (roster entries carry the team captain; walk_in
-- entries have captain_id null -> no captain self-report, host-only — correct).
-- `save_league_schedule` is rewritten to read/write the entry columns.
-- `record_league_match_result` is score-only (match id + scores) and is NOT
-- touched. Leagues only ever had roster entries before ADR 0033 Phase 2, so the
-- backfill is total; a withdrawn roster team (deleted_at set) referenced by an
-- old match backfills to null (it shouldn't be in the schedule). The repository
-- reads columns via a local Row type + string select, so generated types do not
-- gate this; regenerate them (`pnpm --filter @pickupvb/supabase gen:types`)
-- after applying locally.
-- ============================================================================

-- ---- 1. Add entry-id columns --------------------------------------------
alter table public.league_schedule_matches
    add column home_entry_id uuid references public.event_team_entries(id) on delete set null,
    add column away_entry_id uuid references public.event_team_entries(id) on delete set null;

-- ---- 2. Backfill from the live roster entry of each referenced team -------
update public.league_schedule_matches m
   set home_entry_id = e.id
  from public.event_team_entries e
 where m.home_team_id is not null
   and e.team_id     = m.home_team_id
   and e.division_id = m.division_id
   and e.source      = 'roster'
   and e.deleted_at is null;

update public.league_schedule_matches m
   set away_entry_id = e.id
  from public.event_team_entries e
 where m.away_team_id is not null
   and e.team_id     = m.away_team_id
   and e.division_id = m.division_id
   and e.source      = 'roster'
   and e.deleted_at is null;

-- ---- 3. Indexes on the new columns --------------------------------------
create index league_schedule_matches_home_entry_idx
    on public.league_schedule_matches (home_entry_id);
create index league_schedule_matches_away_entry_idx
    on public.league_schedule_matches (away_entry_id);

-- ---- 4. Reframe the distinct-competitors CHECK on entry ids --------------
alter table public.league_schedule_matches
    drop constraint league_schedule_matches_distinct_teams,
    add constraint league_schedule_matches_distinct_entries
        check (home_entry_id is null or away_entry_id is null or home_entry_id <> away_entry_id);

-- ---- 5. Captain helper resolves via event_team_entries.captain_id --------
-- Roster entries carry the team captain's id (set at the table collapse);
-- walk_in entries have captain_id null, so a host-added team has no captain
-- self-report and only the host can record its results.
create or replace function public.is_league_match_captain(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
          from public.league_schedule_matches m
          left join public.event_team_entries a on a.id = m.home_entry_id
          left join public.event_team_entries b on b.id = m.away_entry_id
         where m.id = p_match_id
           and (a.captain_id = auth.uid() or b.captain_id = auth.uid())
    );
$$;

-- ---- 6. Drop the legacy team-id columns + indexes ------------------------
drop index if exists public.league_schedule_matches_home_team_idx;
drop index if exists public.league_schedule_matches_away_team_idx;
alter table public.league_schedule_matches
    drop column home_team_id,
    drop column away_team_id;

-- ---- 7. save_league_schedule writes entry ids ----------------------------
-- Full-replace of a division's slate (delete-all + reinsert in one INVOKER
-- function body). JSON shape per element now carries home_entry_id /
-- away_entry_id instead of the dropped team columns.
create or replace function public.save_league_schedule(
  p_division_id uuid,
  p_matches     jsonb
) returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.league_schedule_matches
   where division_id = p_division_id;

  insert into public.league_schedule_matches (
    id, division_id, week_number, scheduled_at, court_label,
    home_entry_id, away_entry_id, home_score, away_score, status, notes
  )
  select
    (m->>'id')::uuid,
    p_division_id,
    (m->>'week_number')::int,
    (m->>'scheduled_at')::timestamptz,
    m->>'court_label',
    (m->>'home_entry_id')::uuid,
    (m->>'away_entry_id')::uuid,
    (m->>'home_score')::int,
    (m->>'away_score')::int,
    coalesce(m->>'status', 'scheduled'),
    m->>'notes'
  from jsonb_array_elements(p_matches) as m;
$$;

grant execute on function public.save_league_schedule(uuid, jsonb) to authenticated, service_role;
