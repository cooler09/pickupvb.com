-- ============================================================================
-- Pivot: replace bespoke `event_guests` table with Supabase anonymous auth.
--
-- Anonymous visitors now sign up via supabase.auth.signInAnonymously(). Each
-- anon visitor gets a real auth.users row (with `is_anonymous = true`), a
-- profiles row, and a normal event_attendees row — so cross-event tracking,
-- the eventual "claim your account" upgrade, and existing RLS just work.
--
-- This migration:
--   * drops event_guests, list_event_guests(), cancel_guest_signup(),
--     event_is_published(), and the guest capacity trigger
--   * restores enforce_event_capacity() to count only event_attendees
--   * rebuilds events_view without the guest sum
--   * teaches handle_new_user() to seed profiles for anonymous users
--     (they have no email — fall back to a placeholder display_name that
--     the signup action overwrites immediately)
--   * adds `is_anonymous = false` guards to write policies that should
--     remain authenticated-only (host events, create groups, befriend,
--     create teams). Reads and event_attendees inserts stay open to anons.
-- ============================================================================

-- ---- Tear down the guest stack ---------------------------------------------
alter publication supabase_realtime drop table public.event_guests;

drop trigger  if exists trg_enforce_event_capacity_guests on public.event_guests;
drop function if exists public.list_event_guests(uuid);
drop function if exists public.cancel_guest_signup(uuid);
drop function if exists public.event_is_published(uuid);
drop table    if exists public.event_guests cascade;

-- Restore capacity check to attendees-only.
create or replace function public.enforce_event_capacity()
returns trigger language plpgsql as $$
declare
  ev public.events%rowtype;
  current_count int;
begin
  select * into ev from public.events where id = new.event_id;
  if ev.capacity_kind = 'fixed' then
    select count(*) into current_count
      from public.event_attendees where event_id = new.event_id;
    if current_count >= ev.max_spots then
      raise exception 'Event % is full', new.event_id;
    end if;
  end if;
  return new;
end;
$$;

-- Rebuild events_view without the guest sum. (Same shape as before guests.)
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

-- ---- Anonymous-friendly profile bootstrap ----------------------------------
-- Anonymous auth users have no email. Seed them with a generic display_name
-- ("Guest") and let the signup server action overwrite it with whatever the
-- user typed in the form.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_first   text := nullif(new.raw_user_meta_data->>'first_name', '');
  v_last    text := nullif(new.raw_user_meta_data->>'last_name', '');
  v_display text := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(trim(concat_ws(' ', v_first, v_last)), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Guest'
  );
begin
  insert into public.profiles (id, display_name, first_name, last_name)
  values (new.id, v_display, v_first, v_last)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---- Helper: is the current request an anonymous (guest) session? ----------
-- Defaults to `false` for service-role / unauthenticated calls so existing
-- policy semantics don't change for those paths.
create or replace function public.is_anon_session()
returns boolean language sql stable as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb->>'is_anonymous')::boolean,
    false
  );
$$;

-- ---- RLS guards: writes that should remain real-account-only ---------------
-- Hosting an event:
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert with check (
  auth.uid() = host_id
  and not public.is_anon_session()
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

-- Creating a group:
drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups for insert
  with check (
    auth.uid() = created_by
    and not public.is_anon_session()
  );

-- Following another user (friendships are still the follow graph):
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships for insert
  with check (
    auth.uid() = user_id
    and not public.is_anon_session()
  );

-- Following a group:
drop policy if exists group_followers_insert on public.group_followers;
create policy group_followers_insert on public.group_followers for insert
  with check (
    auth.uid() = user_id
    and not public.is_anon_session()
  );

-- Creating a team (captain account must be real):
drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams for insert
  with check (
    auth.uid() = captain_id
    and not public.is_anon_session()
  );

-- event_attendees_insert intentionally NOT guarded — anons RSVPing is the
-- whole point. Capacity trigger + visibility on the surrounding event still
-- apply. event_co_hosts / group_members / team_members inserts already
-- require a non-anon row (admin/captain) to exist on the management side, so
-- they're implicitly protected.
