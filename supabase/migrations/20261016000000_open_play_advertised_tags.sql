-- ============================================================================
-- Open-play advisory tags: "multiple formats" + "multiple skill levels" (Strategy B).
--
-- Context: hosts running an open-play session that offers more than one format
-- (some courts 4s, some 6s) or welcomes more than one skill tier (B + BB + A)
-- had no way to say so — open play carries a single format + single skill tier
-- on its sole division. This adds two event-level arrays that are purely
-- DESCRIPTIVE: `formats` and `skill_tiers`. They let cards / the detail page /
-- search show and match every advertised value, while RSVP, capacity and the
-- waitlist are untouched (every signup still lands in the one shared open-play
-- pool). Per-format/per-tier capacity / pricing / gating was explicitly deferred
-- (would be Strategy A: relax the single-division invariant) — see the
-- multi-format-open-play journal entry. Neither tag creates divisions and the
-- single-division invariant stays in force.
--
-- Impact: additive. New `events.formats format[]` and
-- `events.skill_tiers skill_tier[]`, both `not null default '{}'`. Empty for
-- every existing event, so reads/writes are unchanged for single-value events.
-- `events_view` is rebuilt so the columns reach the read model (`select e.*`
-- freezes the column list at create time), `save_event` is redefined to persist
-- them (faithful copy of 20261012000000 + the two arrays threaded through the
-- upsert, exactly as that migration copied 20260919000000), and `search_events`
-- is replaced (faithful copy of 20260915000000) so the Format filter ALSO
-- matches an advertised format and the skill-band filter ALSO matches an
-- advertised tier — no signature change, the grant survives. A surface CHECK on
-- `formats` mirrors `event_divisions_indoor_format` (indoor → sixes|quads only);
-- skill tiers carry no surface constraint.
-- ============================================================================

-- ---- 1. Columns + surface CHECK --------------------------------------------
-- The formats CHECK mirrors event_divisions_indoor_format: on indoor, every
-- advertised format must be sixes or quads. `<@` is "subset of"; the empty
-- default passes. skill_tiers has no surface constraint (any tier, any surface).
alter table public.events
  add column formats     format[]     not null default '{}',
  add column skill_tiers skill_tier[] not null default '{}';

alter table public.events
  add constraint events_advertised_formats_indoor
    check (surface <> 'indoor' or formats <@ array['sixes', 'quads']::format[]);

-- ---- 2. Rebuild events_view so the new columns reach the read model --------
-- `select e.*` freezes the column list at view-creation time, so the new
-- columns only surface after a rebuild. Body copied verbatim from the current
-- authoritative definition (20261012000000_registration_close_window.sql); the
-- only change is that `e.*` now also yields `formats` + `skill_tiers`.
-- search_events is a
-- classic (`as $$ … $$`) SQL function and does not hard-depend on the view, so
-- the drop needs no cascade and the RPC re-resolves the view at call time.
drop view if exists public.events_view;
create view public.events_view as
select
  e.*,
  st_x(e.geo::geometry) as longitude,
  st_y(e.geo::geometry) as latitude,
  (select count(*)
     from public.event_participants p
     join public.event_divisions d on d.id = p.division_id
    where d.event_id = e.id and p.role = 'attendee')::int as attendee_count,
  (select count(*)
     from public.event_team_entries t
     join public.event_divisions d on d.id = t.division_id
    where d.event_id = e.id and t.deleted_at is null)::int as team_count
from public.events e;
grant select on public.events_view to anon, authenticated;

-- ---- 3. Redefine save_event to persist `formats` + `skill_tiers` -----------
-- Faithful copy of 20261012000000_registration_close_window.sql with `formats`
-- and `skill_tiers` threaded into the events upsert (column list, values, ON
-- CONFLICT update). Everything else is byte-for-byte identical — see that
-- migration (and 20260919000000) for the full delta-reconcile rationale.
create or replace function public.save_event(
  p_event       jsonb,
  p_attendees   jsonb,
  p_waitlist    jsonb,
  p_teams       jsonb,
  p_free_agents jsonb,
  p_divisions   jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_id     uuid := (p_event->>'id')::uuid;
  v_division_ids uuid[];
  v_sole_div     uuid;
  v_attendee_ids uuid[] :=
    coalesce((select array_agg((a->>'user_id')::uuid) from jsonb_array_elements(p_attendees) a), '{}');
  v_wait_ids     uuid[] :=
    coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(p_waitlist)), '{}');
  v_team_ids     uuid[] :=
    coalesce((select array_agg((t->>'team_id')::uuid) from jsonb_array_elements(p_teams) t), '{}');
  v_fa_ids       uuid[] :=
    coalesce((select array_agg((f->>'user_id')::uuid) from jsonb_array_elements(p_free_agents) f), '{}');
  v_keep_div_ids uuid[] :=
    coalesce((select array_agg((d->>'id')::uuid) from jsonb_array_elements(p_divisions) d), '{}');
  v_team       jsonb;
  v_team_uuid  uuid;
  v_div_uuid   uuid;
  v_captain_id uuid;
  v_team_name  text;
begin
  -- 1. Upsert the events row (short_code filled by the BEFORE INSERT trigger).
  insert into public.events (
    id, host_id, title, description, rules, surface, type, visibility, status,
    address_line, city, region, postal_code, country, geo,
    starts_at, ends_at, time_zone, venue_name, registration_closes_at,
    registration_close_offset_minutes, registration_override,
    series_name, series_position, series_size, is_fundraiser, fundraiser_beneficiary,
    theme_tags, formats, skill_tiers, sanctioning_body, registration_mode,
    external_registration_url, external_registration_instructions,
    payment_instructions, payments_off_platform, updated_at
  )
  values (
    v_event_id,
    (p_event->>'host_id')::uuid,
    p_event->>'title',
    p_event->>'description',
    p_event->>'rules',
    (p_event->>'surface')::surface,
    (p_event->>'type')::event_type,
    (p_event->>'visibility')::visibility,
    (p_event->>'status')::event_status,
    p_event->>'address_line',
    p_event->>'city',
    p_event->>'region',
    p_event->>'postal_code',
    p_event->>'country',
    (p_event->>'geo')::geography,
    (p_event->>'starts_at')::timestamptz,
    (p_event->>'ends_at')::timestamptz,
    p_event->>'time_zone',
    p_event->>'venue_name',
    (p_event->>'registration_closes_at')::timestamptz,
    (p_event->>'registration_close_offset_minutes')::int,
    p_event->>'registration_override',
    p_event->>'series_name',
    (p_event->>'series_position')::int,
    (p_event->>'series_size')::int,
    (p_event->>'is_fundraiser')::boolean,
    p_event->>'fundraiser_beneficiary',
    coalesce((select array_agg(value) from jsonb_array_elements_text(p_event->'theme_tags')), '{}'),
    coalesce((select array_agg(value::format) from jsonb_array_elements_text(p_event->'formats')), '{}'),
    coalesce((select array_agg(value::skill_tier) from jsonb_array_elements_text(p_event->'skill_tiers')), '{}'),
    p_event->>'sanctioning_body',
    (p_event->>'registration_mode')::registration_mode,
    p_event->>'external_registration_url',
    p_event->>'external_registration_instructions',
    p_event->>'payment_instructions',
    (p_event->>'payments_off_platform')::boolean,
    (p_event->>'updated_at')::timestamptz
  )
  on conflict (id) do update set
    host_id = excluded.host_id,
    title = excluded.title,
    description = excluded.description,
    rules = excluded.rules,
    surface = excluded.surface,
    type = excluded.type,
    visibility = excluded.visibility,
    status = excluded.status,
    address_line = excluded.address_line,
    city = excluded.city,
    region = excluded.region,
    postal_code = excluded.postal_code,
    country = excluded.country,
    geo = excluded.geo,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    time_zone = excluded.time_zone,
    venue_name = excluded.venue_name,
    registration_closes_at = excluded.registration_closes_at,
    registration_close_offset_minutes = excluded.registration_close_offset_minutes,
    registration_override = excluded.registration_override,
    series_name = excluded.series_name,
    series_position = excluded.series_position,
    series_size = excluded.series_size,
    is_fundraiser = excluded.is_fundraiser,
    fundraiser_beneficiary = excluded.fundraiser_beneficiary,
    theme_tags = excluded.theme_tags,
    formats = excluded.formats,
    skill_tiers = excluded.skill_tiers,
    sanctioning_body = excluded.sanctioning_body,
    registration_mode = excluded.registration_mode,
    external_registration_url = excluded.external_registration_url,
    external_registration_instructions = excluded.external_registration_instructions,
    payment_instructions = excluded.payment_instructions,
    payments_off_platform = excluded.payments_off_platform,
    updated_at = excluded.updated_at;

  -- 2. Current division ids for child scoping (+ sole-division fallback).
  select coalesce(array_agg(id), '{}') into v_division_ids
    from public.event_divisions where event_id = v_event_id;
  if array_length(v_division_ids, 1) = 1 then
    v_sole_div := v_division_ids[1];
  else
    v_sole_div := null;
  end if;

  -- 3. Attendees (delta). Open-play is single-division by invariant, so a new
  --    attendee uses the sole division; multi-division events have their
  --    attendees written by the ticket-checkout flow, so skip inserts here.
  delete from public.event_participants
    where role = 'attendee'
      and division_id = any(v_division_ids)
      and user_id <> all(v_attendee_ids);

  if v_sole_div is not null then
    insert into public.event_participants (division_id, user_id, position, role)
    select v_sole_div, (a->>'user_id')::uuid, a->>'position', 'attendee'
      from jsonb_array_elements(p_attendees) a
     where not exists (
       select 1 from public.event_participants ep
        where ep.role = 'attendee'
          and ep.division_id = any(v_division_ids)
          and ep.user_id = (a->>'user_id')::uuid
     );
  end if;

  update public.event_participants ep
     set position = a.position
    from (
      select (x->>'user_id')::uuid as uid, x->>'position' as position
        from jsonb_array_elements(p_attendees) x
    ) a
   where ep.role = 'attendee'
     and ep.division_id = any(v_division_ids)
     and ep.user_id = a.uid
     and ep.position is distinct from a.position;

  -- 4. Capacity waitlist (delta). Inserts keep created_at = now() so FIFO order
  --    survives across saves (only new users are inserted).
  delete from public.event_waitlist
    where event_id = v_event_id
      and user_id <> all(v_wait_ids);

  insert into public.event_waitlist (event_id, user_id)
  select v_event_id, value::uuid
    from jsonb_array_elements_text(p_waitlist) as w(value)
   where not exists (
     select 1 from public.event_waitlist ew
      where ew.event_id = v_event_id and ew.user_id = value::uuid
   );

  -- 5. Roster teams (delta). Delete removed; attach each newly-desired team via
  --    the same captain/name resolution + partial-index ON CONFLICT as
  --    attach_team_to_division. Ad-hoc / walk-in entries are owned by the
  --    EventTeamRegistration aggregate and are untouched here (source='roster').
  delete from public.event_team_entries
    where source = 'roster'
      and division_id = any(v_division_ids)
      and deleted_at is null
      and team_id <> all(v_team_ids);

  for v_team in select * from jsonb_array_elements(p_teams)
  loop
    v_team_uuid := (v_team->>'team_id')::uuid;
    v_div_uuid := coalesce((v_team->>'division_id')::uuid, v_sole_div);
    continue when v_div_uuid is null;
    -- Only attach teams not already present (non-deleted) — mirrors the TS
    -- "teamsToInsert = desired not in existing" so an existing team's row (with
    -- its registered_at) is left intact.
    continue when exists (
      select 1 from public.event_team_entries
       where source = 'roster'
         and division_id = any(v_division_ids)
         and team_id = v_team_uuid
         and deleted_at is null
    );
    select captain_id, name into v_captain_id, v_team_name
      from public.teams where id = v_team_uuid;
    if v_captain_id is null then
      raise exception 'team % not found', v_team_uuid using errcode = 'P0002';
    end if;
    insert into public.event_team_entries
      (division_id, source, team_id, captain_id, display_name)
    values
      (v_div_uuid, 'roster', v_team_uuid, v_captain_id, v_team_name)
    on conflict (division_id, team_id)
      where team_id is not null and deleted_at is null
      do nothing;
  end loop;

  -- 6. Free agents (delta). Per-entry division (ADR 0019) with sole-division
  --    fallback; idempotent insert (ON CONFLICT DO NOTHING on the partial
  --    (division_id, user_id) index — the former 23505 swallow).
  delete from public.event_participants
    where role = 'free_agent'
      and division_id = any(v_division_ids)
      and user_id <> all(v_fa_ids);

  insert into public.event_participants (division_id, user_id, notes, role)
  select coalesce((f->>'division_id')::uuid, v_sole_div), (f->>'user_id')::uuid, f->>'notes', 'free_agent'
    from jsonb_array_elements(p_free_agents) f
   where coalesce((f->>'division_id')::uuid, v_sole_div) is not null
     and not exists (
       select 1 from public.event_participants ep
        where ep.role = 'free_agent'
          and ep.division_id = any(v_division_ids)
          and ep.user_id = (f->>'user_id')::uuid
     )
  on conflict (division_id, user_id) where user_id is not null do nothing;

  update public.event_participants ep
     set notes = f.notes
    from (
      select (x->>'user_id')::uuid as uid, x->>'notes' as notes
        from jsonb_array_elements(p_free_agents) x
    ) f
   where ep.role = 'free_agent'
     and ep.division_id = any(v_division_ids)
     and ep.user_id = f.uid
     and ep.notes is distinct from f.notes;

  -- 7. Divisions (reconcile) — only when the aggregate explicitly listed them,
  --    so a legacy create that pre-dates multi-division leaves the
  --    events_create_default_division trigger's row in place. Upsert the set by
  --    id, then delete any id no longer present (child rows go to NULL via
  --    `on delete set null` and may be re-resolved by fill_default_division_id).
  if jsonb_array_length(coalesce(p_divisions, '[]'::jsonb)) > 0 then
    insert into public.event_divisions (
      id, event_id, sort_order, label, surface, format, gender, skill_tier, age_group,
      tier_label, team_composition, team_size, capacity_kind, max_spots, price_cents,
      price_unit, prize_text, prize_purse_cents, starts_at, ends_at, allow_free_agents,
      team_registration_mode, position_roster
    )
    select
      (d->>'id')::uuid, v_event_id, (d->>'sort_order')::int, d->>'label',
      (d->>'surface')::surface, (d->>'format')::format, (d->>'gender')::gender,
      (d->>'skill_tier')::skill_tier, (d->>'age_group')::age_group, d->>'tier_label',
      (d->>'team_composition')::team_composition, (d->>'team_size')::int,
      d->>'capacity_kind', (d->>'max_spots')::int, (d->>'price_cents')::int,
      (d->>'price_unit')::price_unit, d->>'prize_text', (d->>'prize_purse_cents')::int,
      (d->>'starts_at')::timestamptz, (d->>'ends_at')::timestamptz,
      coalesce((d->>'allow_free_agents')::boolean, true),
      (d->>'team_registration_mode')::team_registration_mode,
      d->'position_roster'
    from jsonb_array_elements(p_divisions) d
    on conflict (id) do update set
      event_id = excluded.event_id,
      sort_order = excluded.sort_order,
      label = excluded.label,
      surface = excluded.surface,
      format = excluded.format,
      gender = excluded.gender,
      skill_tier = excluded.skill_tier,
      age_group = excluded.age_group,
      tier_label = excluded.tier_label,
      team_composition = excluded.team_composition,
      team_size = excluded.team_size,
      capacity_kind = excluded.capacity_kind,
      max_spots = excluded.max_spots,
      price_cents = excluded.price_cents,
      price_unit = excluded.price_unit,
      prize_text = excluded.prize_text,
      prize_purse_cents = excluded.prize_purse_cents,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      allow_free_agents = excluded.allow_free_agents,
      team_registration_mode = excluded.team_registration_mode,
      position_roster = excluded.position_roster;

    delete from public.event_divisions
      where event_id = v_event_id
        and id <> all(v_keep_div_ids);
  end if;
end;
$$;

grant execute on function public.save_event(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  to authenticated, service_role;

-- ---- 4. Replace search_events so the filters match advertised tags ---------
-- Faithful copy of 20260915000000_search_events_league_ends_at_classification.sql
-- (the authoritative latest version — never copy from an older one). Two changes,
-- both purely additive to existing filters: (a) the `p_format` filter also
-- matches when the advertised `events.formats` array contains the requested
-- format; (b) the skill-band branch also matches when any advertised
-- `events.skill_tiers` entry falls in the requested band (only when no
-- age/team-composition filter is set — those don't apply to advisory tags). So a
-- multi-format / multi-tier open play surfaces under each of its values. No
-- signature/return change — the existing grant survives. The result projection
-- is unchanged (cards already don't render format/tier chips for single-division
-- open play).
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
    -- "Men's" or "BB". Format ALSO matches an advertised (advisory) format
    -- so a multi-format open play surfaces under each format it lists.
    and (p_format is null or exists (
      select 1 from public.event_divisions d
      where d.event_id = e.id and d.format::text = p_format
    ) or p_format = any(e.formats::text[]))
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
      -- Advisory skill-tier tag: match when filtering by band alone (advisory
      -- tags carry no age/team-composition) and any advertised tier is in band.
      or (
        p_skill_band is not null
        and p_age_group is null
        and p_team_composition is null
        and exists (
          select 1 from unnest(e.skill_tiers) as st
          where st::text in (select unnest(tiers) from band_tiers)
        )
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

grant execute on function public.search_events(
  double precision, double precision, double precision,
  text, text, text, text, text,
  timestamptz, timestamptz, int,
  text, text, text, text, text, boolean
) to anon, authenticated;
