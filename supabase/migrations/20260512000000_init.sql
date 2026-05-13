-- ============================================================================
-- PickupVB initial schema
-- ----------------------------------------------------------------------------
-- Mirrors the @pickupvb/domain aggregates:
--   - profiles        -> UserProfile
--   - friendships     -> UserProfile.friends
--   - teams           -> Team
--   - team_members    -> Team.members
--   - events          -> VolleyballEvent
--   - event_attendees -> VolleyballEvent.attendees (open-play)
--   - event_teams     -> VolleyballEvent.teams (tournament)
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists postgis;

-- ---- Enums (mirror @pickupvb/domain enums) ---------------------------------
create type surface         as enum ('indoor', 'grass', 'sand');
create type format          as enum ('sixes', 'quads', 'triples', 'doubles');
create type gender          as enum ('mens', 'womens', 'coed');
create type skill_level     as enum ('beginner', 'intermediate', 'advanced', 'competitive');
create type event_type      as enum ('open_play', 'tournament');
create type visibility      as enum ('public', 'invite_only', 'friends_of_host', 'friends_of_attendees');
create type event_status    as enum ('draft', 'published', 'cancelled', 'completed');

-- ---- Profiles (1:1 with auth.users) ----------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 80),
  home_city    text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- Friendships (symmetric via two rows) ----------------------------------
create table public.friendships (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index on public.friendships (friend_id);

-- ---- Teams ------------------------------------------------------------------
create table public.teams (
  id          uuid primary key default uuid_generate_v4(),
  captain_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (length(name) between 1 and 80),
  format      format not null,
  created_at  timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- ---- Events -----------------------------------------------------------------
create table public.events (
  id              uuid primary key default uuid_generate_v4(),
  host_id         uuid not null references public.profiles(id) on delete restrict,
  title           text not null check (length(title) between 3 and 120),
  description     text not null default '',
  rules           text not null default '',
  surface         surface not null,
  format          format not null,
  gender          gender not null,
  skill_level     skill_level not null,
  type            event_type not null,
  visibility      visibility not null default 'public',
  status          event_status not null default 'draft',
  -- location
  address_line    text not null,
  city            text not null,
  region          text not null,
  postal_code     text not null,
  country         text not null,
  geo             geography(point, 4326) not null,
  -- timing
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  -- capacity (open-play only)
  capacity_kind   text check (capacity_kind in ('fixed', 'unlimited')),
  max_spots       integer check (max_spots is null or max_spots > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- DOMAIN INVARIANTS (mirror packages/domain/src/events/rules.ts)
  constraint events_time_order check (ends_at > starts_at),
  constraint events_indoor_format check (
    surface <> 'indoor' or format in ('sixes', 'quads')
  ),
  constraint events_open_play_capacity check (
    type <> 'open_play' or capacity_kind is not null
  ),
  constraint events_tournament_no_capacity check (
    type <> 'tournament' or capacity_kind is null
  ),
  constraint events_fixed_requires_max check (
    capacity_kind <> 'fixed' or max_spots is not null
  )
);

create index events_geo_idx     on public.events using gist (geo);
create index events_starts_at   on public.events (starts_at);
create index events_visibility  on public.events (visibility);

create table public.event_attendees (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index on public.event_attendees (user_id);

create table public.event_teams (
  event_id uuid not null references public.events(id) on delete cascade,
  team_id  uuid not null references public.teams(id) on delete cascade,
  registered_at timestamptz not null default now(),
  primary key (event_id, team_id)
);

-- ---- Spot enforcement at the DB level (defense in depth) -------------------
create or replace function public.enforce_event_capacity()
returns trigger language plpgsql as $$
declare
  ev public.events%rowtype;
  current_count int;
begin
  select * into ev from public.events where id = new.event_id;
  if ev.capacity_kind = 'fixed' then
    select count(*) into current_count from public.event_attendees where event_id = new.event_id;
    if current_count >= ev.max_spots then
      raise exception 'Event % is full', new.event_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_event_capacity
  before insert on public.event_attendees
  for each row execute function public.enforce_event_capacity();

-- ---- Realtime: publish attendee changes for live spot counts ---------------
alter publication supabase_realtime add table public.event_attendees;
alter publication supabase_realtime add table public.event_teams;
alter publication supabase_realtime add table public.events;

-- ---- Search RPC: events near a point with filters --------------------------
create or replace function public.search_events(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km double precision default null,
  p_surface surface default null,
  p_format format default null,
  p_gender gender default null,
  p_skill skill_level default null,
  p_type event_type default null,
  p_starts_after timestamptz default null,
  p_starts_before timestamptz default null,
  p_limit int default 20
)
returns table (
  id uuid,
  title text,
  surface surface,
  format format,
  gender gender,
  skill_level skill_level,
  type event_type,
  starts_at timestamptz,
  city text,
  region text,
  spots_remaining int,
  distance_km double precision
)
language sql stable as $$
  select e.id, e.title, e.surface, e.format, e.gender, e.skill_level, e.type,
         e.starts_at, e.city, e.region,
         case when e.capacity_kind = 'fixed'
              then greatest(0, e.max_spots - (select count(*) from public.event_attendees a where a.event_id = e.id))
              else null end as spots_remaining,
         case when p_lat is not null and p_lng is not null
              then st_distance(e.geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0
              else null end as distance_km
    from public.events e
   where e.status = 'published'
     and (p_surface is null or e.surface = p_surface)
     and (p_format is null or e.format = p_format)
     and (p_gender is null or e.gender = p_gender)
     and (p_skill is null or e.skill_level = p_skill)
     and (p_type is null or e.type = p_type)
     and (p_starts_after is null or e.starts_at >= p_starts_after)
     and (p_starts_before is null or e.starts_at <= p_starts_before)
     and (
       p_lat is null or p_lng is null or p_radius_km is null
       or st_dwithin(e.geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
     )
   order by case when p_lat is not null then st_distance(e.geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) end nulls last,
            e.starts_at asc
   limit p_limit;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.friendships     enable row level security;
alter table public.teams           enable row level security;
alter table public.team_members    enable row level security;
alter table public.events          enable row level security;
alter table public.event_attendees enable row level security;
alter table public.event_teams     enable row level security;

-- Profiles: anyone can read; users update only their own row.
create policy profiles_select on public.profiles for select using (true);
create policy profiles_update on public.profiles for update using (auth.uid() = id);

-- Friendships: a user sees only their own edges.
create policy friendships_select on public.friendships for select using (auth.uid() = user_id);
create policy friendships_insert on public.friendships for insert with check (auth.uid() = user_id);
create policy friendships_delete on public.friendships for delete using (auth.uid() = user_id);

-- Teams
create policy teams_select on public.teams for select using (true);
create policy teams_insert on public.teams for insert with check (auth.uid() = captain_id);
create policy teams_update on public.teams for update using (auth.uid() = captain_id);

-- Team members: members can see roster; captain manages.
create policy team_members_select on public.team_members for select using (true);
create policy team_members_insert on public.team_members for insert with check (
  exists (select 1 from public.teams t where t.id = team_id and t.captain_id = auth.uid())
);
create policy team_members_delete on public.team_members for delete using (
  exists (select 1 from public.teams t where t.id = team_id and t.captain_id = auth.uid())
  or auth.uid() = user_id
);

-- Events: visibility-aware select.
create policy events_select on public.events for select using (
  status = 'published' and (
    visibility = 'public'
    or auth.uid() = host_id
    or (visibility = 'friends_of_host' and exists (
      select 1 from public.friendships f
       where f.user_id = host_id and f.friend_id = auth.uid()
    ))
    or (visibility = 'friends_of_attendees' and exists (
      select 1 from public.event_attendees a
        join public.friendships f on f.user_id = a.user_id and f.friend_id = auth.uid()
       where a.event_id = events.id
    ))
    -- invite_only requires explicit invite (not modeled yet)
  )
  or auth.uid() = host_id
);
create policy events_insert on public.events for insert with check (auth.uid() = host_id);
create policy events_update on public.events for update using (auth.uid() = host_id);

-- Attendees
create policy event_attendees_select on public.event_attendees for select using (true);
create policy event_attendees_insert on public.event_attendees for insert
  with check (auth.uid() = user_id);
create policy event_attendees_delete on public.event_attendees for delete
  using (auth.uid() = user_id
         or exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));

-- Event teams
create policy event_teams_select on public.event_teams for select using (true);
create policy event_teams_insert on public.event_teams for insert with check (
  exists (select 1 from public.teams t where t.id = team_id and t.captain_id = auth.uid())
);
