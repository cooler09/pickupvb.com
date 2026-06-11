-- ============================================================================
-- Inbox preview sender name — show WHO sent a room's last message.
-- See docs/adr/0028-chat-messaging.md, docs/audits/messages-page-ux.md (MU-4).
--
-- Context: get_inbox (20260825000000, re-issued 20260827000000 to read
-- profiles_public for DM titles) returns `preview` (the latest message body) and
-- `preview_sender_id`, but no sender NAME. The inbox can only render "You: …" for
-- the viewer's own last message; in a busy team/event/group room every other
-- preview is a bare body with no author, so you can't tell who just spoke
-- (messages-page-ux MU-4). DMs don't need it — the conversation title IS the
-- person — but rooms do.
--
-- Impact: `get_inbox` gains one column, `preview_sender_name text` — the display
-- name of the latest non-deleted message's sender, resolved from
-- `public.profiles_public` (NOT base profiles: this function is SECURITY INVOKER
-- and the base profiles SELECT policy is owner-only, so a join to another user's
-- row resolves to nothing — same reason the DM-title fix joins the view). The
-- signature otherwise (args, security mode, search_path, the other ten columns)
-- is unchanged. Additive — callers that ignore the new column keep working.
-- `gen:types` should be run after deploy; the generated types are hand-edited in
-- the same PR to add the column so `pnpm typecheck` sees it.
--
-- Note: adding a column to the RETURNS TABLE changes the function's result type,
-- which CREATE OR REPLACE cannot do (Postgres 42P13 "cannot change return type
-- of existing function"). Drop the existing function first, then recreate.
-- ============================================================================

drop function if exists public.get_inbox(int);

create or replace function public.get_inbox(p_limit int default 50)
returns table (
    conversation_id     uuid,
    kind                text,
    context_id          uuid,
    context_slug        text,
    title               text,
    last_message_at     timestamptz,
    last_read_at        timestamptz,
    is_unread           boolean,
    preview             text,
    preview_sender_id   uuid,
    preview_sender_name text
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
                    -- profiles_public, not profiles: SECURITY INVOKER + owner-only
                    -- base profiles RLS means a join to the *other* participant's
                    -- base row resolves to nothing. The view bypasses base RLS.
                    select pr.display_name
                      from public.conversation_participants cpp
                      join public.profiles_public pr on pr.id = cpp.user_id
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
           order by mm.created_at desc limit 1) as preview_sender_id,
        -- Display name of the latest message's sender (profiles_public, same RLS
        -- reasoning as the DM title above). A since-deleted sender falls out of
        -- the view → NULL, which the UI renders without an author prefix.
        (select pr.display_name
           from public.messages mm
           join public.profiles_public pr on pr.id = mm.sender_id
          where mm.conversation_id = c.id and mm.deleted_at is null
          order by mm.created_at desc limit 1) as preview_sender_name
    from public.conversations c
    left join public.conversation_participants cp
        on cp.conversation_id = c.id and cp.user_id = (select auth.uid())
    where c.deleted_at is null
      and c.last_message_at is not null
    order by c.last_message_at desc
    limit greatest(p_limit, 1);
$$;

grant execute on function public.get_inbox(int) to authenticated;
