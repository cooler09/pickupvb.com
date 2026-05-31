-- ============================================================================
-- Fix: infinite recursion between events_select and event_divisions_select.
--
-- Context: 20260802000000_collapse_attendees_free_agents.sql rewrote
-- events_select and retargeted its `friends_of_attendees` branch at
-- event_participants JOINed to event_divisions. event_divisions_select
-- (20260605000100_event_divisions.sql) gates on
-- `exists (select 1 from events e where e.id = event_divisions.event_id)`,
-- so the RLS policy graph now cycles:
--     events_select -> event_divisions_select -> events_select
-- Postgres expands the policies at plan time, detects the cycle, and aborts
-- EVERY authenticated query against `events` with 42P17 ("infinite recursion
-- detected in policy for relation events"). The app's own reads go through
-- `events_view` / SECURITY DEFINER RPCs (which don't re-enter events RLS), so
-- this stayed invisible — but any direct `from('events')` SELECT/UPDATE under
-- a user session recurses: event edit (change title), paid-event pricing
-- UPDATE, and group-host assignment all fail. This is the same bug class as
-- 20260513000900_fix_event_co_hosts_recursion.sql, reintroduced through a new
-- edge.
--
-- Impact: no schema/columns change. Replaces the events_select policy and adds
-- one SECURITY DEFINER helper. Visibility semantics are unchanged — the
-- friends_of_attendees check still returns true iff the viewer is friends with
-- a confirmed attendee of the event. The helper runs the participant/division/
-- friendship join with definer rights so it does NOT re-trigger
-- event_divisions / event_participants RLS, removing both tables from the
-- events_select policy text and cutting the cycle.
-- ============================================================================

-- Definer-scoped existence check for the friends_of_attendees visibility
-- branch. Running as definer means the internal reads of event_participants
-- and event_divisions bypass their RLS, so this cannot re-enter events_select.
-- It only ever returns a boolean about the *current* caller (auth.uid()),
-- so it leaks nothing beyond what the policy already grants.
create or replace function public.event_has_attendee_friend(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.event_participants p
      join public.event_divisions d on d.id = p.division_id
      join public.friendships f on f.user_id = p.user_id and f.friend_id = auth.uid()
     where d.event_id = p_event_id
       and p.role = 'attendee'
  )
$$;
grant execute on function public.event_has_attendee_friend(uuid) to anon, authenticated;

-- Recreate events_select verbatim from 20260802000000_collapse_attendees_
-- free_agents.sql, with the only change being the friends_of_attendees branch:
-- the inline event_participants/event_divisions join (the recursive edge) is
-- replaced by the definer helper above.
drop policy if exists events_select on public.events;
create policy events_select on public.events for select using (
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
      or visibility = 'invite_only'
      or (
        visibility = 'friends_of_host' and (
          exists (
            select 1 from public.friendships f
             where f.user_id = events.host_id
               and f.friend_id = auth.uid()
          )
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
        visibility = 'friends_of_attendees'
        and public.event_has_attendee_friend(events.id)
      )
    )
  )
);
