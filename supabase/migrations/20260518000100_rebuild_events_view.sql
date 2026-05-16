-- Rebuild events_view to pick up columns added since the last rebuild
-- (most importantly `short_code`, also `position_roster`).
--
-- PostgreSQL freezes the column list of `select e.*` at view-creation time,
-- so columns added to public.events after the view was last (re)created are
-- NOT exposed by the view. The misleading comments in
-- 20260514000500_event_short_codes.sql and
-- 20260514000600_event_position_roster.sql claimed automatic propagation,
-- but in practice `event.shortCode` came through as `undefined`, producing
-- share links like `https://www.pickupvb.com/e/undefined`.
--
-- Shape matches 20260513001100_anon_auth_pivot.sql; only the underlying
-- `e.*` expansion is refreshed.

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
