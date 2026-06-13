-- ============================================================================
-- Community listings: all-day / "time TBD" support.
--
-- Context: most community listings are bulk-imported from public tournament
-- sources (the admin /community-import flow) that publish a DATE but no start
-- time — real start times live on JS/login-walled registration pages. Until now
-- `starts_at` was a required timestamp, which forced the importer to invent a
-- clock time (a 9am placeholder). We'd rather store only what we know. This adds
-- an `all_day` flag so a listing can carry an accurate calendar date with the
-- time deliberately omitted; the app renders the date alone (no "6:30 PM") for
-- those rows. `starts_at` stays NOT NULL — for an all-day listing it's anchored
-- at NOON venue-local, a sentinel that keeps the calendar date stable across
-- every viewer's timezone (noon-UTC lands on the same date from UTC-11..+11).
--
-- Impact: additive. New `all_day boolean not null default false` column — every
-- existing row reads as a timed listing, so no behaviour changes for them. The
-- read RPC `search_community_listings` gains an `all_day` output column (the
-- card needs it to render date-only in distance-filtered browse), so the
-- function is dropped + recreated with the new return shape and re-granted.
-- App-layer changes (domain aggregate, schema, importer, card/detail/JSON-LD)
-- land in the same PR; generated Supabase types are hand-edited to match until
-- the next gen:types against the deployed schema.
-- ============================================================================

alter table public.community_listings
  add column all_day boolean not null default false;

-- Recreate the search RPC with `all_day` in its return table. A return-type
-- change requires DROP + CREATE (create-or-replace can't alter OUT columns).
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
    l.all_day,
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
