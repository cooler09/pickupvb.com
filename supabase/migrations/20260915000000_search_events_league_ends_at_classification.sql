-- ============================================================================
-- Classify leagues by `ends_at` (season end) in `search_events`, not `starts_at`.
--
-- Context: a league event's `starts_at`/`ends_at` are the *season* window
-- (start → playoff end), not a single gathering. `search_events` classified
-- upcoming-vs-past purely by `starts_at` (the `p_starts_after`/`p_starts_before`
-- filters), so a league that had STARTED but not ENDED fell into the "past" tab
-- mid-season and vanished from "upcoming." This is the deferred follow-up from
-- the leagues container-model bundle (docs/journal/2026-06-05-bundle-leagues-
-- container-model.md) — the sibling builder queries `listAttending` and
-- `searchFollowingFeed` get the same treatment in the same PR.
--
-- Impact: behaviour-only. No signature change (existing grant survives), no
-- column changes. For `type = 'league'` rows the date filters and the default
-- (non-distance) ordering now key on `ends_at`; every other event type is
-- unchanged (still `starts_at`). Body is otherwise identical to
-- 20260702000100_search_events_filter_visibility_public.sql.
-- ============================================================================

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
  -- Primary division per event (lowest sort_order) — still used to project
  -- legacy scalar columns into the result and to compute spots_remaining.
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
            'surface',         d.surface::text,
            'format',          d.format::text,
            'gender',          d.gender::text,
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
    and e.visibility = 'public'
    and (p_surface is null or e.surface::text = p_surface)
    -- Format / gender / skill_level: match if ANY division on the event
    -- matches. Open-play events have a single division, so this collapses
    -- to the previous behavior for them; tournaments now match on any of
    -- their divisions, which is what users actually mean when they filter
    -- "Men's" or "BB".
    and (p_format is null or exists (
      select 1 from public.event_divisions d
      where d.event_id = e.id and d.format::text = p_format
    ))
    and (p_gender is null or exists (
      select 1 from public.event_divisions d
      where d.event_id = e.id and d.gender::text = p_gender
    ))
    and (p_skill_level is null or exists (
      select 1 from public.event_divisions d
      where d.event_id = e.id
        and case d.skill_tier
          when 'c'    then 'beginner'
          when 'b'    then 'beginner'
          when 'bb'   then 'intermediate'
          when 'bb3'  then 'intermediate'
          when 'a'    then 'advanced'
          when 'aa'   then 'competitive'
          when 'open' then 'competitive'
        end = p_skill_level
    ))
    and (p_type is null or e.type::text = p_type)
    -- Leagues are seasons: classify upcoming/past by season end (`ends_at`),
    -- not the season start, so an in-progress league stays "upcoming."
    and (p_starts_after  is null
         or (case when e.type::text = 'league' then e.ends_at else e.starts_at end) >= p_starts_after)
    and (p_starts_before is null
         or (case when e.type::text = 'league' then e.ends_at else e.starts_at end) <= p_starts_before)
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
      else extract(epoch from (case when e.type::text = 'league' then e.ends_at else e.starts_at end))
    end
  limit coalesce(p_limit, 20)
$$;
