-- ============================================================================
-- Event divisions: child entity of events. See docs/adr/0006-event-divisions.md.
--
-- An event is the container (when/where/who hosts). A division is the
-- playable bracket (format × gender × skill × age × capacity × price ×
-- prize). One event has 1..N divisions.
--
-- This migration is purely additive:
--   * Adds new enums (skill_tier, age_group, team_composition, price_unit).
--   * Creates event_divisions and backfills one row per existing event
--     mirroring its current format / gender / skill_level / capacity / price.
--   * Adds nullable division_id to event_attendees / event_teams /
--     event_free_agents, populated by trigger when the event has exactly one
--     division (the common case). Existing code that reads/writes these
--     tables without a division_id continues to work.
--
-- Legacy columns on `events` (format, gender, skill_level, price_cents,
-- capacity_kind, max_spots, position_roster) remain authoritative until the
-- UI is migrated. A later migration drops them after the cutover.
-- ============================================================================

-- ---- Enums -----------------------------------------------------------------
-- Skill tier ladder used by outdoor / NAGVA / club tournaments.
create type skill_tier as enum ('c', 'b', 'bb', 'bb3', 'a', 'aa', 'open');

-- Age grouping. 'adult' is the default for everything that isn't explicitly
-- a youth bracket.
create type age_group as enum ('adult', 'hs', '18u', '16u', '14u', 'jr_high');

-- How players sign up for a division.
--   solo              — individuals sign up (open-play style)
--   team              — full pre-formed team registers
--   pair_draw         — sign up as a pair / triple; get drawn with another
--                       pair / triple into the playing team for that round
--   partner_required  — sign up as a fixed N-person team built at signup time
create type team_composition as enum ('solo', 'team', 'pair_draw', 'partner_required');

-- Whether the price is charged per individual player or per team unit.
create type price_unit as enum ('per_player', 'per_team');

-- ---- event_divisions -------------------------------------------------------
create table public.event_divisions (
  id                uuid primary key default uuid_generate_v4(),
  event_id          uuid not null references public.events(id) on delete cascade,
  sort_order        integer not null default 0,
  label             text not null check (length(label) between 1 and 60),

  -- Format axes (mirror legacy event columns, but per-division)
  surface           surface not null,
  format            format not null,
  gender            gender not null,

  -- Skill / age axes
  skill_tier        skill_tier not null,
  age_group         age_group not null default 'adult',
  tier_label        text check (tier_label is null or length(tier_label) between 1 and 40),

  -- How sign-up works
  team_composition  team_composition not null default 'solo',
  team_size         integer check (team_size is null or team_size between 1 and 24),

  -- Capacity (per division; nullable = "no separate cap, falls back to event")
  capacity_kind     text check (capacity_kind in ('fixed', 'unlimited')),
  max_spots         integer check (max_spots is null or max_spots > 0),

  -- Pricing (nullable = inherit event.price_cents at the per_player rate)
  price_cents       integer check (price_cents is null or (price_cents >= 0 and price_cents <= 1000000)),
  price_unit        price_unit not null default 'per_player',

  -- Prize advertisement
  prize_text        text check (prize_text is null or length(prize_text) between 1 and 500),
  prize_purse_cents integer check (prize_purse_cents is null or prize_purse_cents >= 0),

  -- Optional per-division schedule override for multi-day tournaments
  starts_at         timestamptz,
  ends_at           timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint event_divisions_time_order
    check (
      starts_at is null
      or ends_at is null
      or ends_at > starts_at
    ),
  constraint event_divisions_indoor_format
    check (surface <> 'indoor' or format in ('sixes', 'quads')),
  constraint event_divisions_fixed_requires_max
    check (capacity_kind <> 'fixed' or max_spots is not null)
);

create index event_divisions_event_idx
  on public.event_divisions (event_id, sort_order);

-- Updated-at trigger reuses the standard helper
create or replace function public.touch_event_divisions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger event_divisions_touch_updated_at
  before update on public.event_divisions
  for each row execute function public.touch_event_divisions_updated_at();

-- ---- Backfill: one division per existing event -----------------------------
-- Map legacy skill_level → skill_tier:
--   beginner     → 'b'
--   intermediate → 'bb'
--   advanced     → 'a'
--   competitive  → 'open'
--
-- Team composition: tournaments → 'team', open play → 'solo'.
-- Capacity / price are copied so the division is self-sufficient.
insert into public.event_divisions (
  event_id, sort_order, label,
  surface, format, gender,
  skill_tier, age_group,
  team_composition, team_size,
  capacity_kind, max_spots,
  price_cents, price_unit
)
select
  e.id,
  0,
  -- Default label: human-readable summary. Hosts can edit later.
  case
    when e.format is null then upper(e.skill_level::text)
    else initcap(e.gender::text) || ' ' || initcap(e.format::text)
         || ' · ' || upper(e.skill_level::text)
  end,
  e.surface,
  coalesce(e.format, 'sixes'::format),  -- legacy nullable format → default
  coalesce(e.gender, 'coed'::gender),
  case e.skill_level
    when 'beginner'     then 'b'::skill_tier
    when 'intermediate' then 'bb'::skill_tier
    when 'advanced'     then 'a'::skill_tier
    when 'competitive'  then 'open'::skill_tier
  end,
  'adult'::age_group,
  case e.type
    when 'tournament' then 'team'::team_composition
    else 'solo'::team_composition
  end,
  null,                                   -- team_size unknown; hosts opt in later
  e.capacity_kind,
  e.max_spots,
  e.price_cents,
  'per_player'::price_unit
from public.events e;

-- ---- Add division_id to child tables (nullable for now) --------------------
-- During the transition, rows may be inserted without a division_id. A
-- trigger fills it in when the parent event has exactly one division (which
-- is true for every backfilled event and for every event created before the
-- create form gains multi-division support).

alter table public.event_attendees
  add column division_id uuid references public.event_divisions(id) on delete set null;

alter table public.event_teams
  add column division_id uuid references public.event_divisions(id) on delete set null;

alter table public.event_free_agents
  add column division_id uuid references public.event_divisions(id) on delete set null;

create index event_attendees_division_idx   on public.event_attendees   (division_id);
create index event_teams_division_idx       on public.event_teams       (division_id);
create index event_free_agents_division_idx on public.event_free_agents (division_id);

-- Backfill child rows with the (single) division of their event.
update public.event_attendees a
   set division_id = d.id
  from public.event_divisions d
 where d.event_id = a.event_id
   and a.division_id is null;

update public.event_teams t
   set division_id = d.id
  from public.event_divisions d
 where d.event_id = t.event_id
   and t.division_id is null;

update public.event_free_agents f
   set division_id = d.id
  from public.event_divisions d
 where d.event_id = f.event_id
   and f.division_id is null;

-- Trigger to auto-fill division_id on insert when the event has exactly one
-- division. Multi-division events must provide division_id explicitly; the
-- trigger leaves it null and the application enforces the requirement.
create or replace function public.fill_default_division_id()
returns trigger language plpgsql as $$
declare
  v_count int;
  v_division_id uuid;
begin
  if new.division_id is not null then
    return new;
  end if;

  select count(*), max(id) into v_count, v_division_id
    from public.event_divisions
   where event_id = new.event_id;

  if v_count = 1 then
    new.division_id := v_division_id;
  end if;
  return new;
end;
$$;

create trigger event_attendees_fill_division
  before insert on public.event_attendees
  for each row execute function public.fill_default_division_id();

create trigger event_teams_fill_division
  before insert on public.event_teams
  for each row execute function public.fill_default_division_id();

create trigger event_free_agents_fill_division
  before insert on public.event_free_agents
  for each row execute function public.fill_default_division_id();

-- ---- RLS on event_divisions ------------------------------------------------
alter table public.event_divisions enable row level security;

-- SELECT: anyone who can see the parent event can see its divisions.
create policy event_divisions_select on public.event_divisions for select using (
  exists (select 1 from public.events e where e.id = event_divisions.event_id)
);

-- INSERT / UPDATE / DELETE: only the event manager (host user) or an
-- owner/admin of the primary host group.
create policy event_divisions_insert on public.event_divisions for insert
  with check (
    exists (
      select 1 from public.events e
       where e.id = event_divisions.event_id
         and (
           e.host_id = auth.uid()
           or (
             e.host_group_id is not null
             and exists (
               select 1 from public.group_members gm
                where gm.group_id = e.host_group_id
                  and gm.user_id  = auth.uid()
                  and gm.role in ('owner', 'admin')
             )
           )
         )
    )
  );

create policy event_divisions_update on public.event_divisions for update using (
  exists (
    select 1 from public.events e
     where e.id = event_divisions.event_id
       and (
         e.host_id = auth.uid()
         or (
           e.host_group_id is not null
           and exists (
             select 1 from public.group_members gm
              where gm.group_id = e.host_group_id
                and gm.user_id  = auth.uid()
                and gm.role in ('owner', 'admin')
           )
         )
       )
  )
);

create policy event_divisions_delete on public.event_divisions for delete using (
  exists (
    select 1 from public.events e
     where e.id = event_divisions.event_id
       and (
         e.host_id = auth.uid()
         or (
           e.host_group_id is not null
           and exists (
             select 1 from public.group_members gm
              where gm.group_id = e.host_group_id
                and gm.user_id  = auth.uid()
                and gm.role in ('owner', 'admin')
           )
         )
       )
  )
);

grant select on public.event_divisions to anon, authenticated;
grant insert, update, delete on public.event_divisions to authenticated;
