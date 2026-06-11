-- ============================================================================
-- Gamification — harden the badge stat aggregation against cancelled events and
-- null hosts (badges audit BA-1 + BA-8).
-- See docs/adr/0031-gamification-badges.md, docs/audits/badges.md
--
-- Context: `compute_player_badge_stats` guarded the `cancelled` status only in
-- the attendance CTE. Two leaks slipped through:
--   * BA-1 — Seasoned (`leagues_completed`) gated on `e.status = 'completed' OR
--     e.ends_at < now()`, and Champion/Podium had no status guard at all. So a
--     player who registered for a league that was CANCELLED but whose `ends_at`
--     is in the past earned "Seasoned", and a cancelled-after-winner tournament
--     could award "Champion"/"Podium". This breaks ADR 0031's "never mis-award"
--     guarantee — an accomplishment badge must derive only from a real,
--     non-cancelled finished event.
--   * BA-8 — the `per_host` loyalty rollup grouped by `host_id` with no null
--     guard, so every event with a null host_id collapsed into one bucket and
--     inflated `max_events_with_single_host` (Loyal) across unrelated hosts.
--
-- Impact: replaces the function body only — same name, args, and return columns,
-- so the generated types are unchanged. Idempotent `create or replace`. Counts
-- can only go DOWN for affected players (a mis-awarded badge already granted is
-- NOT revoked — grants are durable; this only stops future mis-awards).
-- Status allow-list throughout is ('published','completed) — never 'cancelled'
-- or 'draft'. Seasoned additionally preserves the host-marked-completed-early
-- case (counts a 'completed' league even if `ends_at` hasn't passed); Champion
-- and Podium gate on the same allow-list without an `ends_at` check because the
-- winner is host-recorded, not time-derived.
-- ============================================================================

create or replace function public.compute_player_badge_stats(p_user_id uuid)
returns table (
  published_event_count integer,
  attended_event_count integer,
  distinct_positions_played integer,
  tournament_championships integer,
  tournament_podiums integer,
  leagues_completed integer,
  max_events_with_single_host integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with attended as (
    select distinct ed.event_id, e.host_id
    from public.event_participants ep
    join public.event_divisions ed on ed.id = ep.division_id
    join public.events e on e.id = ed.event_id
    where ep.user_id = p_user_id
      and ep.role = 'attendee'
      and e.status in ('published', 'completed')
      and e.ends_at < now()
  ),
  per_host as (
    -- BA-8: only roll up loyalty per real host. A null host_id would otherwise
    -- lump unrelated events into one bucket and inflate Loyal.
    select host_id, count(*) as n
    from attended
    where host_id is not null
    group by host_id
  ),
  user_entries as (
    select ent.id as entry_id, ent.division_id
    from public.event_team_entries ent
    where ent.deleted_at is null
      and (
        ent.captain_id = p_user_id
        or exists (
          select 1 from public.event_team_entry_members m
           where m.entry_id = ent.id and m.user_id = p_user_id
        )
        or (
          ent.source = 'roster' and exists (
            select 1 from public.team_members tm
             where tm.team_id = ent.team_id
               and tm.user_id = p_user_id
               and tm.status = 'active'
          )
        )
      )
  )
  select
    (select count(*)::integer
       from public.events
      where host_id = p_user_id
        and status = 'published')                                       as published_event_count,
    (select count(*)::integer from attended)                            as attended_event_count,
    (select count(distinct ep.position)::integer
       from public.event_participants ep
       join public.event_divisions ed on ed.id = ep.division_id
       join public.events e on e.id = ed.event_id
      where ep.user_id = p_user_id
        and ep.role = 'attendee'
        and ep.position is not null
        and e.status in ('published', 'completed')
        and e.ends_at < now())                                         as distinct_positions_played,
    -- Champion: non-cancelled tournament divisions the user won (BA-1: gate on a
    -- real finished tournament, not merely a recorded winner).
    (select count(distinct ed.id)::integer
       from public.event_divisions ed
       join public.events e on e.id = ed.event_id
       join user_entries ue on ue.entry_id = ed.winner_entry_id
      where e.type = 'tournament'
        and e.status in ('published', 'completed')
        and ed.winner_entry_id is not null)                            as tournament_championships,
    -- Podium: non-cancelled tournament divisions where the user placed 1st/2nd/3rd.
    (select count(distinct ed.id)::integer
       from public.event_divisions ed
       join public.events e on e.id = ed.event_id
       join user_entries ue
         on ue.entry_id in (ed.winner_entry_id, ed.runner_up_entry_id, ed.third_place_entry_id)
      where e.type = 'tournament'
        and e.status in ('published', 'completed'))                    as tournament_podiums,
    -- Seasoned: distinct FINISHED, non-cancelled league events the user played
    -- in or attended. BA-1: exclude cancelled/draft while preserving the
    -- host-marked-completed-early case — a league counts when it is explicitly
    -- `completed`, OR `published` and already past. The prior
    -- `status='completed' OR ends_at<now()` let a cancelled-but-past league
    -- through.
    (select count(distinct e.id)::integer
       from public.events e
      where e.type = 'league'
        and e.status in ('published', 'completed')
        and (e.status = 'completed' or e.ends_at < now())
        and (
          exists (
            select 1 from public.event_divisions ed
             join user_entries ue on ue.division_id = ed.id
            where ed.event_id = e.id
          )
          or exists (
            select 1 from public.event_participants ep
             join public.event_divisions ed on ed.id = ep.division_id
            where ed.event_id = e.id
              and ep.user_id = p_user_id
              and ep.role = 'attendee'
          )
        ))                                                             as leagues_completed,
    coalesce((select max(n) from per_host), 0)::integer                as max_events_with_single_host;
$$;
