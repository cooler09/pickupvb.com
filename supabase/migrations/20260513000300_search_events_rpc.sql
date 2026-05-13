-- Geo + filter search RPC for the events list / "near me" UX.
-- Returns published events optionally filtered by surface/format/gender/skill/type
-- and time window. If lat/lng/radius are provided, results are constrained to
-- within radius_km kilometers and ordered by ascending distance; otherwise
-- they're ordered by start time. Runs as SECURITY INVOKER so RLS still applies.

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
