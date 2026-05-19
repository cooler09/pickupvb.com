-- ============================================================================
-- ADR 0006 Phase 9d: Drop the legacy single-division columns on `events`.
--
-- Reads and writes for format / gender / skill_level / price_cents /
-- capacity_kind / max_spots / position_roster have all moved to
-- `event_divisions` (Phases 9a–9c). This migration removes the columns,
-- rebuilds the dependent view + RPCs, and rewrites the capacity-enforcement
-- trigger to consult the primary division.
--
-- See docs/adr/0006-event-divisions.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drop the auto-default-division trigger. The application layer
--    (CreateEventHandler) now always emits a default division, so this DB
--    safety net is unnecessary — and would otherwise break when it tries
--    to read the columns we're about to drop.
-- ----------------------------------------------------------------------------
drop trigger  if exists events_create_default_division on public.events;
drop function if exists public.create_default_event_division();

-- ----------------------------------------------------------------------------
-- 2. Drop check constraints that reference the legacy columns. The inline
--    column-level checks go away with the columns themselves; the named
--    table-level ones must be dropped explicitly.
-- ----------------------------------------------------------------------------
alter table public.events drop constraint if exists events_indoor_format;
alter table public.events drop constraint if exists events_open_play_capacity;
alter table public.events drop constraint if exists events_tournament_no_capacity;
alter table public.events drop constraint if exists events_fixed_requires_max;

-- ----------------------------------------------------------------------------
-- 3. Drop dependent view + RPC overloads so the column drops are unblocked.
--    `events_view` is `select e.*` and freezes the column list at create
--    time; the RPCs reference the columns directly.
-- ----------------------------------------------------------------------------
drop view if exists public.events_view;

-- New (Phase 6) division-aware overload.
drop function if exists public.search_events(
  double precision, double precision, double precision,
  text, text, text, text, text,
  timestamptz, timestamptz, int,
  text, text, text, text, text, boolean
);
-- Original enum-typed signature from the initial migration.
drop function if exists public.search_events(
  double precision, double precision, double precision,
  surface, format, gender, skill_level, event_type,
  timestamptz, timestamptz, int
);

-- ----------------------------------------------------------------------------
-- 4. Drop the columns.
-- ----------------------------------------------------------------------------
alter table public.events
  drop column if exists format,
  drop column if exists gender,
  drop column if exists skill_level,
  drop column if exists price_cents,
  drop column if exists capacity_kind,
  drop column if exists max_spots,
  drop column if exists position_roster;

-- ----------------------------------------------------------------------------
-- 5. Rebuild events_view without the dropped columns. Same shape as before;
--    consumers that selected only existing columns are unaffected.
-- ----------------------------------------------------------------------------
create view public.events_view as
select
  e.*,
  st_x(e.geo::geometry) as longitude,
  st_y(e.geo::geometry) as latitude,
  (select count(*) from public.event_attendees a where a.event_id = e.id)::int as attendee_count,
  (select count(*) from public.event_teams    t where t.event_id = e.id)::int as team_count
from public.events e;
grant select on public.events_view to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Rewrite the capacity-enforcement trigger to read the primary division
--    instead of the dropped events.capacity_kind / events.max_spots.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_event_capacity()
returns trigger language plpgsql as $$
declare
  primary_cap_kind  text;
  primary_max_spots int;
  current_count     int;
begin
  select capacity_kind, max_spots
    into primary_cap_kind, primary_max_spots
    from public.event_divisions
   where event_id = new.event_id
   order by sort_order
   limit 1;

  if primary_cap_kind = 'fixed' then
    select count(*) into current_count
      from public.event_attendees
     where event_id = new.event_id;
    if current_count >= primary_max_spots then
      raise exception 'Event % is full', new.event_id;
    end if;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Recreate the division-aware search_events RPC. The returned
--    format/gender/skill_level/spots_remaining columns now derive from the
--    primary (lowest sort_order) division so the client contract is
--    preserved.
-- ----------------------------------------------------------------------------
create or replace function public.search_events(
  p_lat               double precision default null,
  p_lng               double precision default null,
  p_radius_km         double precision default null,
  p_surface           text default null,
  p_format            text default null,
  p_gender            text default null,
  p_skill_level       text default null,
  p_type              text default null,
  p_starts_after      timestamptz default null,
  p_starts_before     timestamptz default null,
  p_limit             int default 20,
  p_skill_band        text default null,
  p_age_group         text default null,
  p_team_composition  text default null,
  p_series_name       text default null,
  p_registration_mode text default null,
  p_is_fundraiser     boolean default null
)
returns table (
  id                uuid,
  title             text,
  surface           text,
  format            text,
  gender            text,
  skill_level       text,
  type              text,
  status            text,
  visibility        text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  time_zone         text,
  address_line      text,
  city              text,
  region            text,
  postal_code       text,
  country           text,
  latitude          double precision,
  longitude         double precision,
  attendee_count    int,
  team_count        int,
  spots_remaining   int,
  distance_km       double precision,
  series_name       text,
  series_position   integer,
  series_size       integer,
  is_fundraiser     boolean,
  registration_mode text,
  divisions         jsonb
)
language sql stable
security invoker
set search_path = public
as $$
  with band_tiers as (
    select case p_skill_band
      when 'beginner'     then array['c','b']::text[]
      when 'intermediate' then array['bb','bb3']::text[]
      when 'advanced'     then array['a']::text[]
      when 'competitive'  then array['aa','open']::text[]
      else null
    end as tiers
  ),
  -- Primary division per event (lowest sort_order). Used to project legacy
  -- columns into the result and to compute spots_remaining.
  primary_div as (
    select distinct on (event_id)
      event_id, format, gender, skill_tier, capacity_kind, max_spots
    from public.event_divisions
    order by event_id, sort_order
  )
  select
    e.id, e.title,
    e.surface::text,
    pd.format::text  as format,
    pd.gender::text  as gender,
    case pd.skill_tier
      when 'c'    then 'beginner'
      when 'b'    then 'beginner'
      when 'bb'   then 'intermediate'
      when 'bb3'  then 'intermediate'
      when 'a'    then 'advanced'
      when 'aa'   then 'competitive'
      when 'open' then 'competitive'
    end as skill_level,
    e.type::text, e.status::text, e.visibility::text,
    e.starts_at, e.ends_at, e.time_zone,
    e.address_line, e.city, e.region, e.postal_code, e.country,
    e.latitude, e.longitude,
    e.attendee_count, e.team_count,
    case
      when pd.capacity_kind = 'fixed' then (pd.max_spots - e.attendee_count)::int
      else null
    end as spots_remaining,
    case
      when p_lat is not null and p_lng is not null then
        st_distance(e.geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0
      else null
    end as distance_km,
    e.series_name, e.series_position, e.series_size,
    e.is_fundraiser, e.registration_mode::text,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',              d.id,
            'label',           d.label,
            'skillTier',       d.skill_tier::text,
            'tierLabel',       d.tier_label,
            'ageGroup',        d.age_group::text,
            'teamComposition', d.team_composition::text,
            'priceCents',      d.price_cents,
            'priceUnit',       d.price_unit::text
          )
          order by d.sort_order, d.label
        )
        from public.event_divisions d
        where d.event_id = e.id
      ),
      '[]'::jsonb
    ) as divisions
  from public.events_view e
  left join primary_div pd on pd.event_id = e.id
  where e.status = 'published'
    and (p_surface     is null or e.surface::text     = p_surface)
    and (p_format      is null or pd.format::text     = p_format)
    and (p_gender      is null or pd.gender::text     = p_gender)
    and (p_skill_level is null or (
      case pd.skill_tier
        when 'c'    then 'beginner'
        when 'b'    then 'beginner'
        when 'bb'   then 'intermediate'
        when 'bb3'  then 'intermediate'
        when 'a'    then 'advanced'
        when 'aa'   then 'competitive'
        when 'open' then 'competitive'
      end = p_skill_level
    ))
    and (p_type        is null or e.type::text        = p_type)
    and (p_starts_after  is null or e.starts_at >= p_starts_after)
    and (p_starts_before is null or e.starts_at <= p_starts_before)
    and (
      p_lat is null or p_lng is null or p_radius_km is null
      or st_dwithin(
        e.geo,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        p_radius_km * 1000
      )
    )
    and (p_series_name       is null or e.series_name ilike '%' || p_series_name || '%')
    and (p_registration_mode is null or e.registration_mode::text = p_registration_mode)
    and (p_is_fundraiser     is null or e.is_fundraiser = p_is_fundraiser)
    and (
      (p_skill_band is null and p_age_group is null and p_team_composition is null)
      or exists (
        select 1 from public.event_divisions d
        where d.event_id = e.id
          and (p_skill_band       is null or d.skill_tier::text in (select unnest(tiers) from band_tiers))
          and (p_age_group        is null or d.age_group::text = p_age_group)
          and (p_team_composition is null or d.team_composition::text = p_team_composition)
      )
    )
  order by
    case
      when p_lat is not null and p_lng is not null then
        st_distance(e.geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
      else extract(epoch from e.starts_at)
    end
  limit coalesce(p_limit, 20)
$$;

grant execute on function public.search_events(
  double precision, double precision, double precision,
  text, text, text, text, text,
  timestamptz, timestamptz, int,
  text, text, text, text, text, boolean
) to anon, authenticated;
