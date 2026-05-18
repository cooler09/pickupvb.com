-- ============================================================================
-- Division-aware search_events RPC. Extends the event-extensions version
-- (20260605000000_event_extensions.sql) with:
--   * Division-level filters: skill_band, age_group, team_composition.
--   * Event-level filters: series_name (ilike), registration_mode, is_fundraiser.
--   * Returns the series breadcrumb + a jsonb array of division summaries so
--     cards can render division badges without a second roundtrip.
--   * Restores spots_remaining (computed from capacity_kind + max_spots +
--     attendee_count) that was dropped when the return shape was widened.
--
-- See docs/adr/0006-event-divisions.md (Phase 6 — search filters).
-- ============================================================================

drop function if exists public.search_events(
  double precision, double precision, double precision,
  text, text, text, text, text,
  timestamptz, timestamptz, int
);

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
  )
  select
    e.id, e.title,
    e.surface::text, e.format::text, e.gender::text,
    e.skill_level::text, e.type::text, e.status::text, e.visibility::text,
    e.starts_at, e.ends_at, e.time_zone,
    e.address_line, e.city, e.region, e.postal_code, e.country,
    e.latitude, e.longitude,
    e.attendee_count, e.team_count,
    case
      when e.capacity_kind = 'fixed' then (e.max_spots - e.attendee_count)::int
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
  where e.status = 'published'
    and (p_surface     is null or e.surface::text     = p_surface)
    and (p_format      is null or e.format::text      = p_format)
    and (p_gender      is null or e.gender::text      = p_gender)
    and (p_skill_level is null or e.skill_level::text = p_skill_level)
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
          and (p_skill_band       is null or d.skill_tier::text = any((select tiers from band_tiers)))
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
