-- ============================================================================
-- Rebuild events_view to expose events.team_registration_mode.
--
-- Context: 20260606000000_team_registration_model.sql added
-- events.team_registration_mode (ADR 0007 — ad_hoc vs roster), but did not
-- rebuild events_view. Postgres freezes a view's column list at creation
-- time even when the body is `select e.*` (same trap documented on
-- 20260603000000_event_listing_time_zone.sql and 20260605000000_event_extensions.sql),
-- so the new column never propagates to the read path.
--
-- Impact: the page-level event detail read model
-- (SupabaseEventRepository.getDetail) selects from events_view and maps
-- `row.team_registration_mode ?? null` into EventDetailReadModel.
-- Without this rebuild the field is always undefined → coerced to null →
-- TournamentRegisterPanel hides the "Register a team" picker (teamEnabled
-- becomes false) and the ad-hoc/roster team panels never render — even on
-- tournaments that were backfilled to 'ad_hoc' by the original migration.
-- After this rebuild the value flows through; no other consumers change.
-- ============================================================================

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
