-- Add IANA time-zone columns so dates can be displayed in venue-local time
-- (e.g. "6:30 PM PST" instead of the viewer's local interpretation of the
-- underlying UTC instant). Populated by the app via tz-lookup on the venue
-- coordinates at create/edit time. Nullable for backfill — UI falls back to
-- the viewer's TZ when null.
--
-- `events_view` already projects `select e.*` (see
-- 20260518000100_rebuild_events_view.sql) so the new column is exposed
-- automatically. The search RPCs return explicit columns, so we extend them
-- below.

alter table public.events
  add column if not exists time_zone text;

alter table public.community_listings
  add column if not exists time_zone text;

-- ---- Re-declare search_events to include time_zone in the return shape ----
--
-- `events_view` is `select e.*`, but PostgreSQL freezes the column list at
-- view-creation time (see 20260518000100_rebuild_events_view.sql). We must
-- drop the dependent function first, rebuild the view to pick up the new
-- column, then recreate the function.

drop function if exists public.search_events(
  double precision, double precision, double precision,
  text, text, text, text, text,
  timestamptz, timestamptz, int
);

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

create or replace function public.search_events(
  p_lat           double precision default null,
  p_lng           double precision default null,
  p_radius_km     double precision default null,
  p_surface       text default null,
  p_format        text default null,
  p_gender        text default null,
  p_skill_level   text default null,
  p_type          text default null,
  p_starts_after  timestamptz default null,
  p_starts_before timestamptz default null,
  p_limit         int default 20
)
returns table (
  id              uuid,
  title           text,
  surface         text,
  format          text,
  gender          text,
  skill_level     text,
  type            text,
  starts_at       timestamptz,
  time_zone       text,
  city            text,
  region          text,
  spots_remaining int,
  distance_km     double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  with point as (
    select case
             when p_lat is not null and p_lng is not null
             then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
             else null
           end as g
  )
  select
    e.id,
    e.title,
    e.surface::text,
    e.format::text,
    e.gender::text,
    e.skill_level::text,
    e.type::text,
    e.starts_at,
    e.time_zone,
    e.city,
    e.region,
    case
      when e.capacity_kind = 'fixed' then (e.max_spots - e.attendee_count)::int
      else null
    end as spots_remaining,
    case
      when (select g from point) is not null
      then st_distance(e.geo, (select g from point)) / 1000.0
      else null
    end as distance_km
  from public.events_view e
  where e.status = 'published'
    and (p_surface     is null or e.surface::text     = p_surface)
    and (p_format      is null or e.format::text      = p_format)
    and (p_gender      is null or e.gender::text      = p_gender)
    and (p_skill_level is null or e.skill_level::text = p_skill_level)
    and (p_type        is null or e.type::text        = p_type)
    and (p_starts_after  is null or e.starts_at >= p_starts_after)
    and (p_starts_before is null or e.starts_at <= p_starts_before)
    and (
      (select g from point) is null
      or p_radius_km is null
      or st_dwithin(e.geo, (select g from point), p_radius_km * 1000.0)
    )
  order by
    distance_km nulls last,
    e.starts_at asc
  limit greatest(coalesce(p_limit, 20), 1);
$$;

grant execute on function public.search_events(
  double precision, double precision, double precision,
  text, text, text, text, text,
  timestamptz, timestamptz, int
) to anon, authenticated;

-- ---- Re-declare search_community_listings to include time_zone ----

drop function if exists public.search_community_listings(
  double precision, double precision, double precision,
  text, text, text,
  timestamptz, timestamptz, text[], int
);

create or replace function public.search_community_listings(
  p_lat           double precision default null,
  p_lng           double precision default null,
  p_radius_km     double precision default null,
  p_surface       text default null,
  p_format        text default null,
  p_skill_level   text default null,
  p_starts_after  timestamptz default null,
  p_starts_before timestamptz default null,
  p_statuses      text[] default array['active']::text[],
  p_limit         int default 20
)
returns table (
  id                  uuid,
  slug                text,
  short_code          text,
  title               text,
  external_url        text,
  external_host_name  text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  time_zone           text,
  city                text,
  region              text,
  surface             text,
  format              text,
  skill_level         text,
  status              text,
  distance_km         double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  with point as (
    select case
             when p_lat is not null and p_lng is not null
             then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
             else null
           end as g
  )
  select
    l.id,
    l.slug,
    l.short_code,
    l.title,
    l.external_url,
    l.external_host_name,
    l.starts_at,
    l.ends_at,
    l.time_zone,
    l.city,
    l.region,
    l.surface::text,
    l.format::text,
    l.skill_level::text,
    l.status,
    case
      when (select g from point) is not null and l.geo is not null
      then st_distance(l.geo, (select g from point)) / 1000.0
      else null
    end as distance_km
  from public.community_listings l
  where l.status = any(coalesce(p_statuses, array['active']::text[]))
    and (p_surface     is null or l.surface::text     = p_surface)
    and (p_format      is null or l.format::text      = p_format)
    and (p_skill_level is null or l.skill_level::text = p_skill_level)
    and (p_starts_after  is null or l.starts_at >= p_starts_after)
    and (p_starts_before is null or l.starts_at <= p_starts_before)
    and (
      (select g from point) is null
      or p_radius_km is null
      or (l.geo is not null and st_dwithin(l.geo, (select g from point), p_radius_km * 1000.0))
    )
  order by
    distance_km nulls last,
    l.starts_at asc
  limit greatest(coalesce(p_limit, 20), 1);
$$;

grant execute on function public.search_community_listings(
  double precision, double precision, double precision,
  text, text, text,
  timestamptz, timestamptz, text[], int
) to anon, authenticated;
