-- ============================================================================
-- Anonymous (guest) signups for events
-- ----------------------------------------------------------------------------
-- Allows non-authenticated visitors to RSVP with just a name (+ optional email,
-- phone, notes). Each row gets a `cancel_token` returned to the user so they
-- can self-cancel via a SECURITY DEFINER RPC without an account.
--
-- Spot accounting: guests count against `max_spots` like authenticated
-- attendees. Capacity trigger updated. `events_view.attendee_count` widened.
--
-- Privacy: PII (email/phone/notes) is only readable by the event manager and
-- group admins. Public listings go through `list_event_guests(uuid)` which
-- returns just id + display_name + created_at.
-- ============================================================================

create table public.event_guests (
  id            uuid primary key default uuid_generate_v4(),
  event_id      uuid not null references public.events(id) on delete cascade,
  display_name  text not null check (length(btrim(display_name)) between 1 and 80),
  email         text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone         text check (phone is null or length(phone) between 3 and 40),
  notes         text check (notes is null or length(notes) <= 500),
  cancel_token  uuid not null default uuid_generate_v4(),
  created_at    timestamptz not null default now()
);

create index event_guests_event_idx on public.event_guests (event_id);
-- One signup per (event, name) — matches the user's chosen duplicate rule.
create unique index event_guests_event_name_uniq
  on public.event_guests (event_id, lower(btrim(display_name)));
-- Lookups by token (used by cancel RPC).
create unique index event_guests_token_idx on public.event_guests (cancel_token);

-- ---- Capacity enforcement: count attendees + guests ------------------------
create or replace function public.enforce_event_capacity()
returns trigger language plpgsql as $$
declare
  ev public.events%rowtype;
  current_count int;
begin
  select * into ev from public.events where id = new.event_id;
  if ev.capacity_kind = 'fixed' then
    select
      (select count(*) from public.event_attendees where event_id = new.event_id)
      + (select count(*) from public.event_guests   where event_id = new.event_id)
      into current_count;
    if current_count >= ev.max_spots then
      raise exception 'Event % is full', new.event_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_event_capacity_guests
  before insert on public.event_guests
  for each row execute function public.enforce_event_capacity();

-- ---- Read view: include guests in attendee_count ---------------------------
drop view if exists public.events_view;
create view public.events_view as
select
  e.*,
  st_x(e.geo::geometry) as longitude,
  st_y(e.geo::geometry) as latitude,
  (
    (select count(*) from public.event_attendees a where a.event_id = e.id)
    + (select count(*) from public.event_guests   g where g.event_id = e.id)
  )::int as attendee_count,
  (select count(*) from public.event_teams    t where t.event_id = e.id)::int as team_count
from public.events e;
grant select on public.events_view to anon, authenticated;

-- ---- RLS -------------------------------------------------------------------
alter table public.event_guests enable row level security;

-- Insert: anyone (including anon) may sign up for a published event. Capacity
-- and visibility are enforced separately (by trigger and by the events_select
-- policy — anon visitors can only see public events anyway).
create policy event_guests_insert on public.event_guests for insert
  with check (
    exists (
      select 1 from public.events e
       where e.id = event_guests.event_id
         and e.status = 'published'
    )
  );

-- Select: PII is sensitive — only the event manager (host_id), admins of the
-- primary host group, or admins of any co-host group can read raw rows.
create policy event_guests_select on public.event_guests for select using (
  exists (
    select 1 from public.events e
     where e.id = event_guests.event_id
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
  or exists (
    select 1 from public.event_co_hosts ch
     where ch.event_id = event_guests.event_id
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
);

-- Delete: same management set. Self-cancel by token uses the SECURITY DEFINER
-- RPC below (which bypasses this policy intentionally).
create policy event_guests_delete on public.event_guests for delete using (
  exists (
    select 1 from public.events e
     where e.id = event_guests.event_id
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

-- ---- Public listing (display_name only) ------------------------------------
create or replace function public.list_event_guests(p_event_id uuid)
returns table (id uuid, display_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.display_name, g.created_at
    from public.event_guests g
   where g.event_id = p_event_id
   order by g.created_at asc;
$$;
grant execute on function public.list_event_guests(uuid) to anon, authenticated;

-- ---- Self-cancel by token --------------------------------------------------
-- Returns the deleted row count (0 = bad/expired token).
create or replace function public.cancel_guest_signup(p_token uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from public.event_guests where cancel_token = p_token;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.cancel_guest_signup(uuid) to anon, authenticated;

-- ---- Realtime --------------------------------------------------------------
alter publication supabase_realtime add table public.event_guests;
