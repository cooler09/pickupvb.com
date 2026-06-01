-- ============================================================================
-- Fix get_inbox DM titles under owner-only profiles RLS — join profiles_public.
-- See docs/adr/0028-chat-messaging.md, docs/audits/privacy.md (regression of P1 #4).
--
-- Context: get_inbox (20260825000000, Phase 2) resolves a DM's title from the
-- *other* participant's display name via `join public.profiles pr`. The function
-- is SECURITY INVOKER, so that join runs under the caller's RLS. The PII audit
-- (20260623000000) tightened the base `profiles` SELECT policy to owner-only
-- (`auth.uid() = id OR is_platform_admin()`), which lands AFTER this chat work in
-- app history but BEFORE it in product reality — so the join to the counterpart's
-- row returns nothing and every DM in the inbox falls back to the literal
-- "Direct message" label instead of the person's name. Room titles
-- (team/event/group) were unaffected; they read teams/events/groups, not
-- profiles.
--
-- Impact: `get_inbox` body only — signature, columns, security mode, and
-- search_path are unchanged (no gen:types needed). The DM-title subquery now
-- joins `public.profiles_public`, the sanctioned public projection. That view is
-- definer-equivalent (not security_invoker), so it bypasses the base-table RLS
-- regardless of the calling function's mode, and it filters `deleted_at IS NULL`
-- — a DM with a since-deleted counterpart now also falls back to "Direct
-- message", which is the desired behaviour. No table, policy, or grant changes.
-- ============================================================================

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
                    -- profiles_public, not profiles: this function is SECURITY
                    -- INVOKER and the base profiles SELECT policy is owner-only,
                    -- so a join to the *other* participant's base row resolves to
                    -- nothing. The view bypasses base-table RLS.
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
           order by mm.created_at desc limit 1) as preview_sender_id
    from public.conversations c
    left join public.conversation_participants cp
        on cp.conversation_id = c.id and cp.user_id = (select auth.uid())
    where c.deleted_at is null
      and c.last_message_at is not null
    order by c.last_message_at desc
    limit greatest(p_limit, 1);
$$;

grant execute on function public.get_inbox(int) to authenticated;
