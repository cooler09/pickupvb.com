-- ============================================================================
-- Per-division team registration mode — ADR 0016 supersedes ADR 0008 §2.
-- See docs/adr/0016-per-division-team-registration-mode.md.
--
-- Context: registration-workflow re-audit (Bundle 117) reframed each
-- division as the unit that owns its teams + free agents. ADR 0008 §2
-- chose one team_registration_mode per event ("the simplest thing that
-- fits 95% of tournaments"); the user has the 5% case (a single
-- tournament with AA on rostered school teams + BB on ad-hoc rec teams)
-- and is splitting events to work around it. The fix: move the column
-- to event_divisions and let each division pick its own mode.
--
-- Impact:
--   1. Adds event_divisions.team_registration_mode (nullable). Backfilled
--      from the parent event's value so existing readers / writers keep
--      observing the same per-division mode they would have inferred.
--   2. Drops events.team_registration_mode. No transitional period — the
--      app-layer code in this PR reads exclusively from divisions.
--   3. Rewrites event_team_registrations_insert + event_team_payments_insert
--      RLS policies to check the division's mode instead of the event's.
--   4. Rebuilds events_view so `select e.*` stops projecting the dropped
--      column (Postgres freezes the column list at view-creation time;
--      same trap as 20260605000000 and 20260611000000).
--   5. Open-play events still get mode=null on their single solo division
--      via the backfill (their events.team_registration_mode was already
--      null). The aggregate continues to reject any non-null mode on an
--      open-play event.
-- ============================================================================

-- ---- 1. Add per-division column + backfill --------------------------------
alter table public.event_divisions
  add column team_registration_mode team_registration_mode;

comment on column public.event_divisions.team_registration_mode is
  'ADR 0016: per-division team paradigm. null = individual signup; '
  '"ad_hoc" = captain assembles a throwaway roster (EventTeamRegistration); '
  '"roster" = host registers an existing persistent Team. Supersedes the '
  'event-level events.team_registration_mode column (dropped in this migration).';

update public.event_divisions d
   set team_registration_mode = e.team_registration_mode
  from public.events e
 where d.event_id = e.id;

-- ---- 2. Rewrite RLS that referenced events.team_registration_mode --------
drop policy if exists event_team_registrations_insert on public.event_team_registrations;
create policy event_team_registrations_insert
  on public.event_team_registrations for insert with check (
    auth.uid() = captain_id
    and exists (
      select 1
        from public.events e
        join public.event_divisions d on d.event_id = e.id
       where e.id = event_id
         and d.id = division_id
         and e.status = 'published'
         and d.team_registration_mode = 'ad_hoc'
    )
  );

drop policy if exists event_team_payments_insert on public.event_team_payments;
create policy event_team_payments_insert
  on public.event_team_payments for insert with check (
    auth.uid() = captain_id
    and exists (
      select 1 from public.event_teams et
       where et.event_id = event_id and et.team_id = team_id
    )
    and exists (
      select 1
        from public.events e
        join public.event_teams et on et.event_id = e.id and et.team_id = team_id
        join public.event_divisions d on d.id = et.division_id
       where e.id = event_id
         and e.status = 'published'
         and d.team_registration_mode = 'roster'
    )
  );

-- ---- 3. Drop the event-level column ---------------------------------------
alter table public.events
  drop column team_registration_mode;

-- ---- 4. Rebuild events_view so `select e.*` stops projecting the column ---
drop view if exists public.events_view;
create view public.events_view as
select
  e.*,
  st_x(e.geo::geometry) as longitude,
  st_y(e.geo::geometry) as latitude,
  (select count(*) from public.event_attendees a where a.event_id = e.id)::int as attendee_count,
  (select count(*) from public.event_teams    t where t.event_id = e.id)::int as team_count
from public.events e;
grant select on public.events_view to anon, authenticated;
