-- ============================================================================
-- list_room_recipients — fan-out helper for room-message notifications.
-- See docs/adr/0028-chat-messaging.md (chat engine) + the notifications audit
-- P2 #6 (room messages don't notify).
--
-- Context: chat DMs ping their recipient (lib/notify-chat.ts), but room
-- (team / event / group) messages pinged nobody. Room membership is DERIVED
-- from the source tables, not materialized in conversation_participants
-- (20260824000000), so the app layer can't read a recipient list off one table.
-- This SECURITY DEFINER set-returning function returns the recipient user_ids
-- for a room conversation, mirroring the membership branches of
-- `can_access_conversation` (the proven access gate) so the two never drift —
-- excluding the sender (p_exclude) and anyone who muted the room.
--
-- Impact: new function `list_room_recipients(uuid, uuid) returns table(user_id
-- uuid)`, granted to service_role only (called from the session-less notify
-- fan-out on the admin client; no user context to honor, and it would otherwise
-- leak a room's roster to any caller). Additive — no existing reads/writes
-- change. DMs do NOT use this (their two participant rows are the recipient
-- list); only rooms. Run `gen:types` after — the generated types were
-- hand-edited to add this function ahead of the real schema.
-- ============================================================================

create or replace function public.list_room_recipients(p_conversation_id uuid, p_exclude uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
    with conv as (
        select c.kind, c.context_id
          from public.conversations c
         where c.id = p_conversation_id
           and c.deleted_at is null
           and c.kind <> 'dm'
    ),
    members as (
        -- Team room: active members + the captain.
        select tm.user_id
          from public.team_members tm, conv
         where conv.kind = 'team' and tm.team_id = conv.context_id
        union
        select t.captain_id
          from public.teams t, conv
         where conv.kind = 'team' and t.id = conv.context_id and t.captain_id is not null
        -- Event room: host + co-hosts + registered attendees (attendance lives on
        -- event_participants keyed by division → join through event_divisions).
        union
        select e.host_id
          from public.events e, conv
         where conv.kind = 'event' and e.id = conv.context_id and e.host_id is not null
        union
        select ch.host_user_id
          from public.event_co_hosts ch, conv
         where conv.kind = 'event' and ch.event_id = conv.context_id and ch.host_user_id is not null
        union
        select ep.user_id
          from public.event_participants ep
          join public.event_divisions ed on ed.id = ep.division_id, conv
         where conv.kind = 'event' and ed.event_id = conv.context_id and ep.role = 'attendee'
        -- Group room: any member.
        union
        select gm.user_id
          from public.group_members gm, conv
         where conv.kind = 'group' and gm.group_id = conv.context_id
    )
    select distinct m.user_id
      from members m
     where m.user_id is not null
       and m.user_id <> p_exclude
       -- Respect a per-room mute (conversation_participants is the mute store
       -- even though membership is derived; a member with no row isn't muted).
       and not exists (
           select 1
             from public.conversation_participants p
            where p.conversation_id = p_conversation_id
              and p.user_id = m.user_id
              and p.muted_at is not null
       );
$$;

-- Service-role only: the notify fan-out runs on the admin client, and the
-- function would otherwise expose a room's full roster to any authenticated
-- caller.
revoke all on function public.list_room_recipients(uuid, uuid) from public;
grant execute on function public.list_room_recipients(uuid, uuid) to service_role;
