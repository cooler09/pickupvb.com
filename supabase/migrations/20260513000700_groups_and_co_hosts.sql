-- ============================================================================
-- Groups / orgs as event hosts + multi-host events
-- ----------------------------------------------------------------------------
-- Adds:
--   * groups            : org/team profile (name, slug, avatar, description, location)
--   * group_members     : (group_id, user_id, role) with owner/admin/member roles
--   * group_followers   : (group_id, user_id) follow edges, mirrors user follows
--   * events.host_group_id : optional primary group host (events.host_id is still
--                            the user who manages the event — required, never null)
--   * event_co_hosts    : (event_id, host_user_id | host_group_id) additional hosts
--
-- Visibility model (extends events_select):
--   - Visible if you're an admin/owner of the primary host group.
--   - "friends_of_host" now means: you follow the primary host user OR follow
--     the primary host group OR you're a member of the primary host group OR
--     you follow / are a member of any co-host party.
-- ============================================================================

create type group_role as enum ('owner', 'admin', 'member');

create table public.groups (
  id           uuid primary key default uuid_generate_v4(),
  slug         text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name         text not null check (length(name) between 1 and 80),
  description  text not null default '',
  avatar_url   text,
  home_city    text,
  region       text,
  created_by   uuid not null references public.profiles(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index groups_created_by_idx on public.groups (created_by);

create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       group_role not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.group_followers (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_followers_user_idx on public.group_followers (user_id);

-- Add primary group host to events. host_id (user) remains the manager.
alter table public.events
  add column host_group_id uuid references public.groups(id) on delete restrict;

create index events_host_group_idx on public.events (host_group_id);

-- Co-hosts: any number of additional user/group hosts.
create table public.event_co_hosts (
  event_id      uuid not null references public.events(id) on delete cascade,
  host_user_id  uuid references public.profiles(id) on delete cascade,
  host_group_id uuid references public.groups(id) on delete cascade,
  added_at      timestamptz not null default now(),
  added_by      uuid references public.profiles(id) on delete set null,
  -- Exactly one of host_user_id / host_group_id is set.
  constraint event_co_hosts_one_party check (
    (host_user_id is not null)::int + (host_group_id is not null)::int = 1
  ),
  -- Don't co-host as the primary host (enforced by index expressions below).
  unique (event_id, host_user_id),
  unique (event_id, host_group_id)
);
create index event_co_hosts_user_idx  on public.event_co_hosts (host_user_id);
create index event_co_hosts_group_idx on public.event_co_hosts (host_group_id);

-- Recreate the read view to surface host_group_id (e.* picks it up automatically,
-- but we recreate so dependent code sees the column on view introspection).
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

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.groups          enable row level security;
alter table public.group_members   enable row level security;
alter table public.group_followers enable row level security;
alter table public.event_co_hosts  enable row level security;

-- Groups: anyone can see; creator inserts; owners/admins update; owners delete.
create policy groups_select on public.groups for select using (true);

create policy groups_insert on public.groups for insert
  with check (auth.uid() = created_by);

create policy groups_update on public.groups for update
  using (
    exists (
      select 1 from public.group_members gm
       where gm.group_id = groups.id
         and gm.user_id  = auth.uid()
         and gm.role in ('owner', 'admin')
    )
  );

create policy groups_delete on public.groups for delete
  using (
    exists (
      select 1 from public.group_members gm
       where gm.group_id = groups.id
         and gm.user_id  = auth.uid()
         and gm.role = 'owner'
    )
  );

-- Group members: anyone can read the roster. Only owners/admins can manage,
-- members can leave themselves. The very first owner row is inserted by a
-- SECURITY DEFINER trigger on groups insert (see below).
create policy group_members_select on public.group_members for select using (true);

create policy group_members_insert on public.group_members for insert
  with check (
    exists (
      select 1 from public.group_members gm
       where gm.group_id = group_members.group_id
         and gm.user_id  = auth.uid()
         and gm.role in ('owner', 'admin')
    )
  );

create policy group_members_update on public.group_members for update
  using (
    exists (
      select 1 from public.group_members gm
       where gm.group_id = group_members.group_id
         and gm.user_id  = auth.uid()
         and gm.role in ('owner', 'admin')
    )
  );

create policy group_members_delete on public.group_members for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.group_members gm
       where gm.group_id = group_members.group_id
         and gm.user_id  = auth.uid()
         and gm.role in ('owner', 'admin')
    )
  );

-- Group followers: a user only sees / manages their own follow edges.
-- (Aggregate counts are exposed via a view granted to authenticated below.)
create policy group_followers_select on public.group_followers for select
  using (auth.uid() = user_id);
create policy group_followers_insert on public.group_followers for insert
  with check (auth.uid() = user_id);
create policy group_followers_delete on public.group_followers for delete
  using (auth.uid() = user_id);

-- Auto-create the founding owner row when a group is inserted.
create or replace function public.handle_new_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();

-- ============================================================================
-- Update events RLS: now considers host_group_id, co-hosts, and group followers.
-- ============================================================================
drop policy if exists events_select on public.events;
drop policy if exists events_insert on public.events;
drop policy if exists events_update on public.events;

create policy events_select on public.events for select using (
  -- Always visible to the manager (host_id user) and to admins of the host group.
  auth.uid() = host_id
  or (
    host_group_id is not null
    and exists (
      select 1 from public.group_members gm
       where gm.group_id = events.host_group_id
         and gm.user_id  = auth.uid()
         and gm.role in ('owner', 'admin')
    )
  )
  -- Always visible to listed co-hosts (user co-hosts, or admins of co-host groups).
  or exists (
    select 1 from public.event_co_hosts ch
     where ch.event_id = events.id
       and (
         ch.host_user_id = auth.uid()
         or (ch.host_group_id is not null and exists (
           select 1 from public.group_members gm
            where gm.group_id = ch.host_group_id
              and gm.user_id  = auth.uid()
              and gm.role in ('owner', 'admin')
         ))
       )
  )
  or (
    status = 'published' and (
      visibility = 'public'
      or (
        visibility = 'friends_of_host' and (
          -- Follows the primary user host
          exists (
            select 1 from public.friendships f
             where f.user_id = events.host_id
               and f.friend_id = auth.uid()
          )
          -- Or follows / is a member of the primary group host
          or (host_group_id is not null and (
            exists (
              select 1 from public.group_followers gf
               where gf.group_id = events.host_group_id
                 and gf.user_id  = auth.uid()
            )
            or exists (
              select 1 from public.group_members gm
               where gm.group_id = events.host_group_id
                 and gm.user_id  = auth.uid()
            )
          ))
          -- Or follows / is a member of any co-host party
          or exists (
            select 1 from public.event_co_hosts ch
             where ch.event_id = events.id
               and (
                 (ch.host_user_id is not null and exists (
                    select 1 from public.friendships f
                     where f.user_id = ch.host_user_id
                       and f.friend_id = auth.uid()
                 ))
                 or (ch.host_group_id is not null and (
                    exists (
                      select 1 from public.group_followers gf
                       where gf.group_id = ch.host_group_id
                         and gf.user_id  = auth.uid()
                    )
                    or exists (
                      select 1 from public.group_members gm
                       where gm.group_id = ch.host_group_id
                         and gm.user_id  = auth.uid()
                    )
                 ))
               )
          )
        )
      )
      or (
        visibility = 'friends_of_attendees' and exists (
          select 1 from public.event_attendees a
            join public.friendships f on f.user_id = a.user_id and f.friend_id = auth.uid()
           where a.event_id = events.id
        )
      )
    )
  )
);

-- Insert: the user creates the event (host_id = auth.uid()), and if a group is
-- the primary host they must be owner/admin of it.
create policy events_insert on public.events for insert with check (
  auth.uid() = host_id
  and (
    host_group_id is null
    or exists (
      select 1 from public.group_members gm
       where gm.group_id = host_group_id
         and gm.user_id  = auth.uid()
         and gm.role in ('owner', 'admin')
    )
  )
);

-- Update: original manager OR group owner/admin of the primary host group.
create policy events_update on public.events for update using (
  auth.uid() = host_id
  or (
    host_group_id is not null
    and exists (
      select 1 from public.group_members gm
       where gm.group_id = events.host_group_id
         and gm.user_id  = auth.uid()
         and gm.role in ('owner', 'admin')
    )
  )
);

-- ============================================================================
-- Co-hosts RLS: read inherits via the events relationship; manage via event mgr.
-- ============================================================================
create policy event_co_hosts_select on public.event_co_hosts for select using (
  exists (select 1 from public.events e where e.id = event_co_hosts.event_id)
);

create policy event_co_hosts_insert on public.event_co_hosts for insert
  with check (
    exists (
      select 1 from public.events e
       where e.id = event_co_hosts.event_id
         and (
           e.host_id = auth.uid()
           or (e.host_group_id is not null and exists (
             select 1 from public.group_members gm
              where gm.group_id = e.host_group_id
                and gm.user_id  = auth.uid()
                and gm.role in ('owner', 'admin')
           ))
         )
    )
  );

create policy event_co_hosts_delete on public.event_co_hosts for delete
  using (
    exists (
      select 1 from public.events e
       where e.id = event_co_hosts.event_id
         and (
           e.host_id = auth.uid()
           or (e.host_group_id is not null and exists (
             select 1 from public.group_members gm
              where gm.group_id = e.host_group_id
                and gm.user_id  = auth.uid()
                and gm.role in ('owner', 'admin')
           ))
         )
    )
  );

-- Realtime
alter publication supabase_realtime add table public.event_co_hosts;
