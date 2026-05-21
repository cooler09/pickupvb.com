-- ===========================================================================
-- ADR 0007: Team registration model — ad-hoc vs. roster, division-aware.
--
-- Three changes, all backwards-compatible with code paths that still insert
-- into event_attendees / event_teams without an explicit division_id (the
-- existing fill_default_division_id trigger handles single-division events):
--
--   1. New enum + nullable column events.team_registration_mode.
--      'ad_hoc' = captain assembles a one-off team at signup time.
--      'roster' = captain picks one of their persistent teams.
--      NULL    = team registration not applicable (open-play with
--                individual RSVP only).
--      Backfill: all existing tournaments default to 'ad_hoc'.
--
--   2. event_team_registrations + event_team_registration_members tables
--      that store ad-hoc teams. Members can be either an existing user
--      (user_id) or a freeform display_name (+ optional email) for
--      unregistered players. RLS mirrors event_teams: captain inserts,
--      host or captain can delete/update, public can read (event
--      visibility is gated at the event level by existing policies).
--
--   3. Make event_attendees.division_id, event_teams.division_id, and
--      event_free_agents.division_id NOT NULL. Backfill stragglers by
--      picking the event's first division (by sort_order). Events that
--      somehow lack any division get one created on the fly using the
--      same mapping as the after-insert default-division trigger.
-- ===========================================================================

-- ---- 1. team_registration_mode enum + column ------------------------------
create type team_registration_mode as enum ('ad_hoc', 'roster');

alter table public.events
  add column team_registration_mode team_registration_mode;

comment on column public.events.team_registration_mode is
  'How players form teams for this event. ''ad_hoc'' = captain builds a one-off team at signup time (stored in event_team_registrations). ''roster'' = captain picks one of their persistent teams. NULL = team registration not applicable (open-play).';

-- Backfill: every existing tournament gets ad_hoc (the adult-pickup
-- default that motivated ADR 0007). Open-play events stay NULL.
update public.events
   set team_registration_mode = 'ad_hoc'
 where type = 'tournament';

-- ---- 2. event_team_registrations ------------------------------------------
create table public.event_team_registrations (
  id                  uuid primary key default uuid_generate_v4(),
  event_id            uuid not null references public.events(id) on delete cascade,
  division_id         uuid not null references public.event_divisions(id) on delete restrict,
  captain_id          uuid not null references public.profiles(id) on delete cascade,
  name                text not null check (length(name) between 1 and 80),

  -- Captain-checkout state. Only meaningful for per_team-priced divisions
  -- on on-platform events; otherwise stays at 'none' (off-platform) or is
  -- driven by individual per-player checkouts.
  payment_status      text not null default 'none'
                      check (payment_status in ('none', 'pending', 'paid', 'refunded')),
  checkout_session_id text,
  payment_intent_id   text,
  amount_paid_cents   integer check (amount_paid_cents is null or amount_paid_cents >= 0),
  paid_at             timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index event_team_registrations_event_idx
  on public.event_team_registrations (event_id);
create index event_team_registrations_division_idx
  on public.event_team_registrations (division_id);
create index event_team_registrations_captain_idx
  on public.event_team_registrations (captain_id);

create or replace function public.touch_event_team_registrations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger event_team_registrations_touch_updated_at
  before update on public.event_team_registrations
  for each row execute function public.touch_event_team_registrations_updated_at();

-- ---- 3. event_team_registration_members -----------------------------------
create table public.event_team_registration_members (
  id              uuid primary key default uuid_generate_v4(),
  registration_id uuid not null references public.event_team_registrations(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  display_name    text check (display_name is null or length(display_name) between 1 and 80),
  email           text check (email is null or length(email) between 3 and 254),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),

  -- Every roster slot must identify a player somehow: either link to a
  -- profile, or carry a freeform display_name (with email optional).
  constraint event_team_registration_members_has_identity
    check (user_id is not null or display_name is not null)
);

create index event_team_registration_members_reg_idx
  on public.event_team_registration_members (registration_id);
create index event_team_registration_members_user_idx
  on public.event_team_registration_members (user_id);

-- ---- 4. RLS ---------------------------------------------------------------
alter table public.event_team_registrations enable row level security;
alter table public.event_team_registration_members enable row level security;

-- Reads: anyone can see (matches event_teams / event_attendees policy of
-- relying on event-level visibility filtering at the query layer).
create policy event_team_registrations_select
  on public.event_team_registrations for select using (true);

-- Insert: only the captain themself, only when the event is published and
-- the host has opted into ad-hoc team registration. Roster mode uses the
-- existing event_teams table; ad-hoc registrations go here.
create policy event_team_registrations_insert
  on public.event_team_registrations for insert with check (
    auth.uid() = captain_id
    and exists (
      select 1 from public.events e
       where e.id = event_id
         and e.status = 'published'
         and e.team_registration_mode = 'ad_hoc'
    )
  );

-- Update / delete: captain or host.
create policy event_team_registrations_update
  on public.event_team_registrations for update using (
    auth.uid() = captain_id
    or exists (
      select 1 from public.events e
       where e.id = event_id and e.host_id = auth.uid()
    )
  );

create policy event_team_registrations_delete
  on public.event_team_registrations for delete using (
    auth.uid() = captain_id
    or exists (
      select 1 from public.events e
       where e.id = event_id and e.host_id = auth.uid()
    )
  );

-- Members: read = public (gated upstream); write = captain (or host via
-- the parent registration's RLS by virtue of cascade).
create policy event_team_registration_members_select
  on public.event_team_registration_members for select using (true);

create policy event_team_registration_members_insert
  on public.event_team_registration_members for insert with check (
    exists (
      select 1 from public.event_team_registrations r
       where r.id = registration_id
         and r.captain_id = auth.uid()
    )
  );

create policy event_team_registration_members_update
  on public.event_team_registration_members for update using (
    exists (
      select 1 from public.event_team_registrations r
       where r.id = registration_id
         and (r.captain_id = auth.uid()
              or exists (select 1 from public.events e
                          where e.id = r.event_id and e.host_id = auth.uid()))
    )
  );

create policy event_team_registration_members_delete
  on public.event_team_registration_members for delete using (
    exists (
      select 1 from public.event_team_registrations r
       where r.id = registration_id
         and (r.captain_id = auth.uid()
              or exists (select 1 from public.events e
                          where e.id = r.event_id and e.host_id = auth.uid()))
    )
  );

-- Realtime: surface new team registrations & roster edits to live UIs the
-- same way event_teams / event_attendees are already published.
alter publication supabase_realtime add table public.event_team_registrations;
alter publication supabase_realtime add table public.event_team_registration_members;

-- ---- 5. division_id NOT NULL backfill -------------------------------------
-- Most rows already have division_id set by fill_default_division_id().
-- Stragglers fall into two buckets:
--   a) event has 2+ divisions, row was inserted before division_id was
--      a required field on the write path → pick the first by sort_order.
--   b) event somehow has zero divisions (legacy data created before the
--      after-insert default-division trigger landed) → create one first,
--      then point the row at it.

-- (b) Create a default division for events that lack any. ADR 0006 Phase 9d
--     dropped the legacy format/gender/skill_level/price_cents/capacity_kind/
--     max_spots columns from `events` (all live on event_divisions now), and
--     the application layer always emits a default division on create — so
--     this is purely a safety net for pre-Phase-9d rows that bypassed the
--     trigger. We fall back to neutral defaults; hosts can edit afterwards.
insert into public.event_divisions (
  event_id, sort_order, label,
  surface, format, gender,
  skill_tier, age_group,
  team_composition, team_size,
  capacity_kind, max_spots,
  price_cents, price_unit
)
select e.id, 0,
  'Open',
  e.surface,
  'sixes'::format,
  'coed'::gender,
  'bb'::skill_tier,
  'adult'::age_group,
  case e.type
    when 'tournament' then 'team'::team_composition
    else 'solo'::team_composition
  end,
  null,
  null,
  null,
  0,
  'per_player'::price_unit
  from public.events e
 where not exists (
   select 1 from public.event_divisions d where d.event_id = e.id
 );

-- (a) Pick the first division per event for any straggler rows. We use a
--     correlated subquery rather than a window function so that this
--     statement remains tolerant of pre-existing non-null rows (which the
--     `where` clause excludes anyway).
update public.event_attendees a
   set division_id = (
     select d.id from public.event_divisions d
      where d.event_id = a.event_id
      order by d.sort_order, d.created_at
      limit 1
   )
 where a.division_id is null;

update public.event_teams t
   set division_id = (
     select d.id from public.event_divisions d
      where d.event_id = t.event_id
      order by d.sort_order, d.created_at
      limit 1
   )
 where t.division_id is null;

update public.event_free_agents f
   set division_id = (
     select d.id from public.event_divisions d
      where d.event_id = f.event_id
      order by d.sort_order, d.created_at
      limit 1
   )
 where f.division_id is null;

-- Enforce going forward. The fill_default_division_id trigger continues to
-- auto-fill division_id on inserts for single-division events, so existing
-- call sites (joinEvent, ticket checkout, guest signup) keep working.
-- Multi-division event signups must pass division_id explicitly; the new
-- RegisterPanel UI is responsible for that.
alter table public.event_attendees   alter column division_id set not null;
alter table public.event_teams       alter column division_id set not null;
alter table public.event_free_agents alter column division_id set not null;
