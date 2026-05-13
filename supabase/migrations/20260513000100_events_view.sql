-- Read model for events: exposes lat/lng (extracted from geo) so the
-- repository adapter doesn't have to deal with PostGIS WKT on the read path.

create or replace view public.events_view as
select
  e.*,
  st_x(e.geo::geometry) as longitude,
  st_y(e.geo::geometry) as latitude,
  (select count(*) from public.event_attendees a where a.event_id = e.id)::int as attendee_count,
  (select count(*) from public.event_teams t where t.event_id = e.id)::int as team_count
from public.events e;

-- Inheritable RLS: views inherit policies from the underlying table.
grant select on public.events_view to anon, authenticated;
