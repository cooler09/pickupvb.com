-- ============================================================================
-- Community listings: align with the events model — add `event_type` + `gender`.
--
-- Context: the community directory now blends tournaments, recurring leagues,
-- and pickup/drop-in (from the Volo + Volleyball Life imports), but a listing
-- couldn't say *which* — so users can't tell or filter them apart. These two
-- columns reuse the **same Postgres enums as `events`** (`event_type`,
-- `gender`) for true parity: `event_type` powers a new "Type" filter + card
-- badge; `gender` (coed / men's / women's) is a card tag. Both nullable
-- (unknown) — additive, existing rows read as null.
--
-- Impact: two new columns. The search RPC is rebuilt to (a) **return**
-- event_type + gender (for badges, incl. the geo/near path), (b) accept a new
-- `p_event_type` filter, and (c) **restore `all_day` + `time_zone`** to its
-- output — the 20261014000000 latlng rebuild dropped them, so the geo path had
-- been defaulting all-day/timezone; this brings it back to parity with the
-- plain-table path. Return-shape change ⇒ DROP + CREATE (+ re-grant).
-- App-layer + generated types land in the same PR.
-- ============================================================================

alter table public.community_listings
  add column event_type public.event_type,
  add column gender public.gender;

drop function if exists public.search_community_listings(
  double precision, double precision, double precision,
  text, text, text,
  timestamptz, timestamptz, text[], int
);

create function public.search_community_listings(
  p_lat           double precision default null,
  p_lng           double precision default null,
  p_radius_km     double precision default null,
  p_surface       text default null,
  p_format        text default null,
  p_skill_level   text default null,
  p_event_type    text default null,
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
  all_day             boolean,
  time_zone           text,
  event_type          text,
  gender              text,
  city                text,
  region              text,
  surface             text,
  format              text,
  skill_level         text,
  status              text,
  distance_km         double precision,
  latitude            double precision,
  longitude           double precision
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
    l.all_day,
    l.time_zone,
    l.event_type::text,
    l.gender::text,
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
    end as distance_km,
    st_y(l.geo::geometry) as latitude,
    st_x(l.geo::geometry) as longitude
  from public.community_listings l
  where l.status = any(coalesce(p_statuses, array['active']::text[]))
    and (p_surface     is null or l.surface::text     = p_surface)
    and (p_format      is null or l.format::text      = p_format)
    and (p_skill_level is null or l.skill_level::text = p_skill_level)
    and (p_event_type  is null or l.event_type::text  = p_event_type)
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
  text, text, text, text,
  timestamptz, timestamptz, text[], int
) to anon, authenticated;
