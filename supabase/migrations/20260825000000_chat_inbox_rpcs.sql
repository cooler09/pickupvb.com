-- ============================================================================
-- Chat inbox — read RPCs for the unread/inbox surface (ADR 0028, Phase 2).
-- See docs/adr/0028-chat-messaging.md
--
-- Context: Phase 1 (20260824000000) shipped the team-room MVP — schema, RLS,
-- the broadcast trigger, and the get-or-create RPCs. Phase 2 adds the inbox: a
-- list of the viewer's conversations with unread state, plus a header badge
-- count. Both are pure reads driven by `conversation_participants.last_read_at`
-- vs. `conversations.last_message_at`.
--
-- These are SECURITY INVOKER (not DEFINER): unlike get_or_create_conversation,
-- they need no privilege escalation — RLS on `conversations` already filters a
-- SELECT to exactly the rooms the caller can access (the `conversations_select`
-- policy is `can_access_conversation`) and the messages/participants policies do
-- the rest. So the functions ride RLS as the caller, and a non-member simply
-- gets fewer rows. `(select auth.uid())` keeps the planner treating the uid as a
-- stable init-plan. Titles/previews/slugs are resolved per `kind` so the web
-- layer gets a ready-to-render row.
--
-- Impact: new functions `get_inbox(int)` / `count_unread_conversations()` (run
-- `gen:types` after). Additive only — no schema or policy changes.
-- ============================================================================

-- "Unread by me": at least one non-deleted message from someone else, newer
-- than my read cursor. A conversation I only posted in myself is not unread.
-- `'epoch'` covers the no-participant-row case (rooms don't materialize one
-- until first mark-read).

create or replace function public.get_inbox(p_limit int default 50)
returns table (
    conversation_id   uuid,
    kind              text,
    context_id        uuid,
    context_slug      text,
    title             text,
    last_message_at   timestamptz,
    last_read_at      timestamptz,
    is_unread         boolean,
    preview           text,
    preview_sender_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        c.id,
        c.kind,
        c.context_id,
        case c.kind
            when 'team'  then (select t.slug from public.teams  t where t.id = c.context_id)
            when 'group' then (select g.slug from public.groups g where g.id = c.context_id)
            else null
        end as context_slug,
        coalesce(
            c.title,
            case c.kind
                when 'team'  then (select t.name  from public.teams  t where t.id = c.context_id)
                when 'event' then (select e.title from public.events e where e.id = c.context_id)
                when 'group' then (select g.name  from public.groups g where g.id = c.context_id)
                when 'dm'    then (
                    select pr.display_name
                      from public.conversation_participants cpp
                      join public.profiles pr on pr.id = cpp.user_id
                     where cpp.conversation_id = c.id
                       and cpp.user_id <> (select auth.uid())
                     limit 1)
                else null
            end
        ) as title,
        c.last_message_at,
        cp.last_read_at,
        exists (
            select 1 from public.messages mu
             where mu.conversation_id = c.id
               and mu.deleted_at is null
               and mu.sender_id <> (select auth.uid())
               and mu.created_at > coalesce(cp.last_read_at, 'epoch'::timestamptz)
        ) as is_unread,
        (select left(mm.body, 140) from public.messages mm
           where mm.conversation_id = c.id and mm.deleted_at is null
           order by mm.created_at desc limit 1) as preview,
        (select mm.sender_id from public.messages mm
           where mm.conversation_id = c.id and mm.deleted_at is null
           order by mm.created_at desc limit 1) as preview_sender_id
    from public.conversations c
    left join public.conversation_participants cp
        on cp.conversation_id = c.id and cp.user_id = (select auth.uid())
    where c.deleted_at is null
      and c.last_message_at is not null
    order by c.last_message_at desc
    limit greatest(p_limit, 1);
$$;

create or replace function public.count_unread_conversations()
returns int
language sql
stable
security invoker
set search_path = ''
as $$
    select count(*)::int
      from public.conversations c
      left join public.conversation_participants cp
        on cp.conversation_id = c.id and cp.user_id = (select auth.uid())
     where c.deleted_at is null
       and c.last_message_at is not null
       and exists (
            select 1 from public.messages mu
             where mu.conversation_id = c.id
               and mu.deleted_at is null
               and mu.sender_id <> (select auth.uid())
               and mu.created_at > coalesce(cp.last_read_at, 'epoch'::timestamptz)
       );
$$;

grant execute on function public.get_inbox(int)                 to authenticated;
grant execute on function public.count_unread_conversations()   to authenticated;
