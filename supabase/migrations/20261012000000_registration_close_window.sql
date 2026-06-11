-- ============================================================================
-- Host-controlled registration-close window.
--
-- Context: events.registration_closes_at (absolute cutoff, added in
-- 20260605000000_event_extensions.sql) was stored and displayed but enforced
-- NOWHERE — the domain signup methods and the web `signupsOpen` gate only ever
-- checked status + start time, so setting a close time did nothing. This change
-- makes "registration closed" a real, enforced, computed predicate
-- (VolleyballEvent.registrationIsClosed / isRegistrationClosed) and gives hosts
-- three ways to drive it:
--   * absolute time          — the existing registration_closes_at column;
--   * relative window        — registration_close_offset_minutes (minutes
--                              before starts_at; e.g. 1440 = "close 24h before",
--                              auto-follows if the host moves the start time);
--   * manual override        — registration_override ('closed' force-closes,
--                              'open' force-opens until start, null = follow the
--                              schedule). Driven by a "Close now / Reopen" host
--                              toggle on the manage dashboard.
-- A closed event stays `published`/discoverable — this is a signup gate, not a
-- new lifecycle status.
--
-- Impact: additive, all nullable — existing rows keep registration "open until
-- start" (both new columns null) so behaviour is unchanged. The absolute and
-- relative windows are mutually exclusive (CHECK + UI radio). events_view is
-- recreated so the new columns reach the read path (Postgres freezes a `select
-- e.*` view's column list at creation — same trap documented on
-- 20260611000000 / 20260605000000). save_event is redefined to persist the two
-- new columns (the create/edit-via-repo write path). The raw edit-page UPDATE
-- writes them directly. No backfill.
-- ============================================================================

alter table public.events
  add column if not exists registration_close_offset_minutes integer,
  add column if not exists registration_override             text;

alter table public.events
  add constraint events_registration_close_offset_nonneg
    check (
      registration_close_offset_minutes is null
      or registration_close_offset_minutes >= 0
    ),
  add constraint events_registration_override_enum
    check (registration_override is null or registration_override in ('open', 'closed')),
  -- Absolute and relative close windows are two ways to express the same thing;
  -- at most one may be set (the host UI is a radio between them).
  add constraint events_registration_close_one_window
    check (num_nonnulls(registration_closes_at, registration_close_offset_minutes) <= 1);

-- ---- Rebuild events_view so the new columns reach the read model ------------
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

-- ---- Redefine save_event to persist the two new columns ---------------------
-- Faithful copy of 20260919000000_save_event_rpc.sql with
-- registration_close_offset_minutes + registration_override threaded into the
-- events upsert (column list, values, and ON CONFLICT update). Everything else
-- is byte-for-byte identical — see that migration for the full rationale.
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
    theme_tags, sanctioning_body, registration_mode,
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
