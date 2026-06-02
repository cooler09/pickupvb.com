-- ============================================================================
-- Gamification — true Podium: record 2nd & 3rd place per division.
-- See docs/adr/0031-gamification-badges.md
--
-- Context: the Podium badge was a placeholder — set equal to Champion because
-- `event_divisions` recorded only `winner_entry_id` (1st place). This adds
-- runner-up and third-place entry columns so hosts can record a full podium, and
-- updates `compute_player_badge_stats` so the Podium badge is awarded to 2nd/3rd
-- finishers too (not just champions). Mirrors the winner column added in
-- 20260607000000 / collapsed to `winner_entry_id` later.
--
-- Impact: additive. Two nullable FK columns on `event_divisions`
-- (runner_up_entry_id, third_place_entry_id → event_team_entries, ON DELETE SET
-- NULL). Generated types gain the columns. `compute_player_badge_stats` is
-- replaced (same signature) so tournament_podiums now counts divisions where the
-- player is in the winner, runner-up, OR third entry; Champion stays winner-only.
-- No existing reads/writes break — the winner flow is untouched.
-- ============================================================================

alter table public.event_divisions
  add column runner_up_entry_id   uuid references public.event_team_entries(id) on delete set null,
  add column third_place_entry_id uuid references public.event_team_entries(id) on delete set null;

create index event_divisions_runner_up_idx
  on public.event_divisions (runner_up_entry_id)
  where runner_up_entry_id is not null;

create index event_divisions_third_place_idx
  on public.event_divisions (third_place_entry_id)
  where third_place_entry_id is not null;

-- Recompute the badge stats. Only the tournament_podiums expression changes
-- (now winner ∪ runner_up ∪ third); everything else is identical to
-- 20260904000000_badge_tournament_stats.sql.
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
    select host_id, count(*) as n from attended group by host_id
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
    -- Champion: tournament divisions the user won.
    (select count(distinct ed.id)::integer
       from public.event_divisions ed
       join public.events e on e.id = ed.event_id
       join user_entries ue on ue.entry_id = ed.winner_entry_id
      where e.type = 'tournament'
        and ed.winner_entry_id is not null)                            as tournament_championships,
    -- Podium: tournament divisions where the user placed 1st, 2nd, or 3rd.
    (select count(distinct ed.id)::integer
       from public.event_divisions ed
       join public.events e on e.id = ed.event_id
       join user_entries ue
         on ue.entry_id in (ed.winner_entry_id, ed.runner_up_entry_id, ed.third_place_entry_id)
      where e.type = 'tournament')                                     as tournament_podiums,
    -- Seasoned: distinct finished league events the user played in or attended.
    (select count(distinct e.id)::integer
       from public.events e
      where e.type = 'league'
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
