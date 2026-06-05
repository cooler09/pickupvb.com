-- ============================================================================
-- Gamification — fill the deferred tournament/league badge stats.
-- See docs/adr/0031-gamification-badges.md ("Deferred").
--
-- Context: 20260902000000_user_badges.sql shipped `compute_player_badge_stats`
-- with tournament_championships / tournament_podiums / leagues_completed
-- hard-coded to 0, because resolving "who won" needs joins the aggregate can't
-- do at command time and we would not award a high-visibility "Champion" off
-- untested logic. This migration fills them from the **authoritative,
-- host-recorded** source rather than fragile bracket-match topology:
--   * `event_divisions.winner_entry_id` — the host explicitly records the
--     winning entry per division (the division-winners panel). Far safer than
--     inferring a champion from match wiring across single-elim / double-elim /
--     pools / round-robin formats.
--
-- A winning entry resolves to its players three ways (an entry is roster /
-- ad_hoc / walk_in — migration 20260731000000): the `captain_id`, the
-- `event_team_entry_members` roster (ad_hoc/walk_in), and — for roster entries —
-- the persistent `team_members` (status = 'active'). The `user_entries` CTE
-- below unions all three once and is reused for championships and league
-- participation.
--
-- Impact: replaces the function body only — same name, args, and return
-- columns, so the generated types are unchanged. Idempotent `create or replace`.
--
-- Known limitation (documented, not a bug): there is no authoritative 2nd/3rd
-- place source (only one `winner_entry_id` per division), so `tournament_podiums`
-- is set equal to `tournament_championships` — a champion is correctly on the
-- podium, and we never false-award a non-champion. True runner-up / 3rd needs a
-- placement-recording surface (follow-up).
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
    -- Distinct past, non-cancelled events the user actually attended, with the
    -- host of each. role = 'attendee' excludes collapsed free-agent rows.
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
  -- Every team entry the user belongs to: captain, ad-hoc/walk-in roster member,
  -- or active member of the persistent team behind a roster entry.
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
    -- Champion: tournament divisions whose recorded winner is one of the
    -- user's entries.
    (select count(distinct ed.id)::integer
       from public.event_divisions ed
       join public.events e on e.id = ed.event_id
       join user_entries ue on ue.entry_id = ed.winner_entry_id
      where e.type = 'tournament'
        and ed.winner_entry_id is not null)                            as tournament_championships,
    -- Podium: at least the championships (see header — no 2nd/3rd source yet).
    (select count(distinct ed.id)::integer
       from public.event_divisions ed
       join public.events e on e.id = ed.event_id
       join user_entries ue on ue.entry_id = ed.winner_entry_id
      where e.type = 'tournament'
        and ed.winner_entry_id is not null)                            as tournament_podiums,
    -- Seasoned: distinct finished league events the user played in (on a team
    -- entry) or attended.
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
