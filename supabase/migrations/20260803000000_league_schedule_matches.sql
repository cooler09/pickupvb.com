-- ============================================================================
-- League schedule matches: per-division weekly schedule for leagues.
-- See docs/audits/event-data-model.md § P1 #2.
--
-- Context: event_brackets (formerly tournament_brackets) is built for
-- one-sitting structures (single-elim / round-robin / pool-play-playoff)
-- that resolve in a day. A league season is a sequence of weeks, each week
-- a slate of matches across the division, terminating in a playoff bracket.
-- The bracket model doesn't fit; this table is a sibling keyed off
-- event_divisions.id. The end-of-season playoff still uses event_brackets
-- against the same division_id — the two coexist.
--
-- Impact: additive only. Creates league_schedule_matches + indexes + RLS +
-- realtime publication entry; no existing tables touched. RLS posture
-- mirrors event_brackets (public select, host insert/delete, host or match
-- captain update). Domain aggregate LeagueSchedule + repository port land
-- in this same bundle. Application handlers, server actions, and UI wiring
-- are NOT in this bundle (thin-pass scope per P1 #2).
-- ============================================================================

create table public.league_schedule_matches (
    id              uuid primary key default gen_random_uuid(),
    division_id     uuid not null references public.event_divisions(id) on delete cascade,
    week_number     int  not null check (week_number >= 1),
    scheduled_at    timestamptz not null,
    court_label     text,
    home_team_id    uuid references public.teams(id) on delete set null,
    away_team_id    uuid references public.teams(id) on delete set null,
    home_score      int  check (home_score is null or home_score >= 0),
    away_score      int  check (away_score is null or away_score >= 0),
    status          text not null default 'scheduled'
        check (status in ('scheduled', 'in_progress', 'completed', 'forfeit', 'cancelled')),
    notes           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint league_schedule_matches_distinct_teams
        check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id)
);

create index league_schedule_matches_division_week_idx
    on public.league_schedule_matches (division_id, week_number, scheduled_at);

create index league_schedule_matches_home_team_idx
    on public.league_schedule_matches (home_team_id);

create index league_schedule_matches_away_team_idx
    on public.league_schedule_matches (away_team_id);

-- updated_at trigger (per-table touch function, matching the
-- event_divisions convention).
create or replace function public.touch_league_schedule_matches_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger league_schedule_matches_touch_updated_at
    before update on public.league_schedule_matches
    for each row execute function public.touch_league_schedule_matches_updated_at();

-- ---------- helper: is current user a host/co-host of the parent event? ----------
-- public.is_event_host(p_event_id) already exists; our RLS boundary is
-- division_id, so wrap it.
create or replace function public.is_event_host_for_division(p_division_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.event_divisions d
         where d.id = p_division_id
           and public.is_event_host(d.event_id)
    );
$$;

-- ---------- helper: is current user a captain of either team on the match? ----------
create or replace function public.is_league_match_captain(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
          from public.league_schedule_matches m
          left join public.teams a on a.id = m.home_team_id
          left join public.teams b on b.id = m.away_team_id
         where m.id = p_match_id
           and (a.captain_id = auth.uid() or b.captain_id = auth.uid())
    );
$$;

-- ---------- RLS ----------
alter table public.league_schedule_matches enable row level security;

create policy league_schedule_matches_select
    on public.league_schedule_matches for select using (true);

create policy league_schedule_matches_insert
    on public.league_schedule_matches for insert
    with check (public.is_event_host_for_division(division_id));

create policy league_schedule_matches_update
    on public.league_schedule_matches for update
    using (
        public.is_event_host_for_division(division_id)
        or public.is_league_match_captain(id)
    )
    with check (
        public.is_event_host_for_division(division_id)
        or public.is_league_match_captain(id)
    );

create policy league_schedule_matches_delete
    on public.league_schedule_matches for delete
    using (public.is_event_host_for_division(division_id));

-- Realtime: hosts and captains watch the schedule update live.
alter publication supabase_realtime add table public.league_schedule_matches;
