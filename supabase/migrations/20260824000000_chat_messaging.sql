-- ============================================================================
-- Chat / messaging — a unified conversation engine for context rooms
-- (team / event / group) AND 1:1 direct messages, with live delivery over the
-- existing private Realtime Broadcast pattern.
-- See docs/adr/0028-chat-messaging.md   ← write alongside Phase 1.
--
-- Context: pickupvb had no messaging concept. This is Phase 0 of the chat
-- rollout — schema + RLS + helpers + the Realtime broadcast trigger + the
-- get-or-create RPCs. No app code consumes it yet; Phase 1 wires the team-room
-- MVP on top. The design deliberately reuses three proven templates already in
-- the tree:
--   * media_posts (20260820000000) — UGC moderation: report table, after-report
--     auto-hide trigger, anonymous-auth INSERT guard, soft-delete lifecycle.
--   * notification_broadcast (20260823000000) — `realtime.broadcast_changes`
--     AFTER-write trigger + a `realtime.messages` SELECT policy gating a private
--     topic. Chat swaps the per-user topic `notifications:{uid}` for a
--     per-conversation topic `chat:{conversation_id}`.
--   * is_event_host / is_platform_admin — SECURITY DEFINER membership helpers
--     reused so room access checks don't recurse through RLS.
--
-- Impact: new tables `conversations`, `conversation_participants`, `messages`,
-- `message_reports`, `user_blocks` (run `gen:types` after). New SECURITY DEFINER
-- helpers `can_access_conversation` / `can_moderate_conversation` /
-- `is_blocked_pair`; RPCs `get_or_create_conversation` / `get_or_create_dm`;
-- the `broadcast_message()` trigger; a `realtime.messages` policy for `chat:%`
-- topics. Additive only — no existing reads/writes change. Room membership is
-- DERIVED from the source membership tables (team_members / event_participants /
-- group_members) via the access helper, NOT materialized per member; DMs are the
-- exception (their two participant rows ARE the access grant). The `attachments
-- jsonb` column on `messages` is reserved for the Phase 4 image fast-follow and
-- pinned empty by the `messages_text_only` CHECK (dropped in Phase 4 — no table
-- migration needed to ship images).
-- ============================================================================

-- ---- Tables ---------------------------------------------------------------

create table public.conversations (
    id              uuid primary key default uuid_generate_v4(),
    kind            text not null check (kind in ('team', 'event', 'group', 'dm')),
    -- team_id / event_id / group_id for rooms; NULL for dm.
    context_id      uuid,
    -- Canonical sorted user-pair "minId:maxId" for dm; NULL for rooms.
    dm_key          text,
    title           text check (title is null or length(title) between 1 and 120),
    created_by      uuid references public.profiles(id) on delete set null,
    created_at      timestamptz not null default now(),
    last_message_at timestamptz,
    deleted_at      timestamptz,
    constraint conversations_shape check (
        (kind = 'dm'  and context_id is null and dm_key is not null)
        or (kind <> 'dm' and context_id is not null and dm_key is null)
    )
);

-- One conversation per room context; one conversation per DM user-pair.
create unique index conversations_room_uq on public.conversations (kind, context_id) where kind <> 'dm';
create unique index conversations_dm_uq   on public.conversations (dm_key)            where kind = 'dm';
create index conversations_last_msg_idx   on public.conversations (last_message_at desc nulls last);

create table public.conversation_participants (
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_id         uuid not null references public.profiles(id) on delete cascade,
    -- 'admin' is a display hint (host/captain/owner); the access gate is the
    -- source-membership subquery, not this column.
    role            text not null default 'member' check (role in ('member', 'admin')),
    last_read_at    timestamptz,
    muted_at        timestamptz,
    joined_at       timestamptz not null default now(),
    primary key (conversation_id, user_id)
);

create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
    id              uuid primary key default uuid_generate_v4(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    sender_id       uuid not null references public.profiles(id) on delete cascade,
    body            text not null default '' check (length(body) <= 4000),
    -- Reserved for the Phase 4 image fast-follow. Each element will be
    -- { bucket, path, width, height, mime, size }. Pinned empty until then.
    attachments     jsonb not null default '[]'::jsonb,
    report_count    int not null default 0,
    deleted_at      timestamptz,
    deleted_by      uuid references public.profiles(id) on delete set null,
    edited_at       timestamptz,
    created_at      timestamptz not null default now(),
    -- Phase 4 drops this one CHECK to enable attachments — no column change.
    constraint messages_text_only check (jsonb_array_length(attachments) = 0),
    -- A message must carry content (body now; body-or-attachment after Phase 4).
    constraint messages_nonempty check (
        length(btrim(body)) > 0 or jsonb_array_length(attachments) > 0
    )
);

create index messages_conv_recent_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx      on public.messages (sender_id);

create table public.message_reports (
    id               uuid primary key default uuid_generate_v4(),
    message_id       uuid not null references public.messages(id) on delete cascade,
    reporter_user_id uuid not null references public.profiles(id) on delete cascade,
    reason           text check (reason is null or length(reason) <= 500),
    created_at       timestamptz not null default now(),
    unique (message_id, reporter_user_id)
);

create index message_reports_message_idx on public.message_reports (message_id);

create table public.user_blocks (
    blocker_id uuid not null references public.profiles(id) on delete cascade,
    blocked_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (blocker_id, blocked_id),
    constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- ---- Membership / access helpers ------------------------------------------
-- SECURITY DEFINER + schema-qualified refs under `search_path = ''` so the
-- subqueries bypass RLS on the membership tables and never recurse through the
-- policies that call them (the recursion that 20260816000000 had to fix). These
-- are the single gate every chat policy reuses. `(select auth.uid())` keeps the
-- planner treating the uid as a stable init-plan rather than a per-row re-eval.

create or replace function public.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.user_blocks ub
         where (ub.blocker_id = p_a and ub.blocked_id = p_b)
            or (ub.blocker_id = p_b and ub.blocked_id = p_a)
    );
$$;

create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
          from public.conversations c
         where c.id = p_conversation_id
           and c.deleted_at is null
           and (
                -- DM: caller is one of the two materialized participants.
                (c.kind = 'dm' and exists (
                    select 1 from public.conversation_participants p
                     where p.conversation_id = c.id
                       and p.user_id = (select auth.uid())))
                -- Team room: active member or the captain.
                or (c.kind = 'team' and (
                    exists (select 1 from public.team_members tm
                             where tm.team_id = c.context_id
                               and tm.user_id = (select auth.uid()))
                    or exists (select 1 from public.teams t
                                where t.id = c.context_id
                                  and t.captain_id = (select auth.uid()))))
                -- Event room: host/co-host or a registered attendee. Attendance
                -- lives on event_participants keyed by division, so join through
                -- event_divisions to the event.
                or (c.kind = 'event' and (
                    public.is_event_host(c.context_id)
                    or exists (
                        select 1 from public.event_participants ep
                          join public.event_divisions ed on ed.id = ep.division_id
                         where ed.event_id = c.context_id
                           and ep.user_id = (select auth.uid())
                           and ep.role = 'attendee')))
                -- Group room: any member.
                or (c.kind = 'group' and exists (
                    select 1 from public.group_members gm
                     where gm.group_id = c.context_id
                       and gm.user_id = (select auth.uid())))
           )
    );
$$;

create or replace function public.can_moderate_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
          from public.conversations c
         where c.id = p_conversation_id
           and (
                public.is_platform_admin()
                or (c.kind = 'team' and exists (
                    select 1 from public.teams t
                     where t.id = c.context_id and t.captain_id = (select auth.uid())))
                or (c.kind = 'event' and public.is_event_host(c.context_id))
                or (c.kind = 'group' and exists (
                    select 1 from public.group_members gm
                     where gm.group_id = c.context_id
                       and gm.user_id = (select auth.uid())
                       and gm.role in ('owner', 'admin')))
                -- DMs have no moderator beyond the platform admin.
           )
    );
$$;

grant execute on function public.is_blocked_pair(uuid, uuid)        to authenticated;
grant execute on function public.can_access_conversation(uuid)      to authenticated;
grant execute on function public.can_moderate_conversation(uuid)    to authenticated;

-- ---- last_message_at maintenance ------------------------------------------
-- Definer trigger so the bump bypasses RLS on conversations (a plain member has
-- no UPDATE grant). Inbox ordering reads this denormalized column.

create or replace function public.messages_bump_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.conversations
        set last_message_at = new.created_at
        where id = new.conversation_id;
    return null;
end;
$$;

drop trigger if exists messages_bump_conversation_after_insert on public.messages;
create trigger messages_bump_conversation_after_insert
    after insert on public.messages
    for each row execute function public.messages_bump_conversation();

-- ---- Realtime Broadcast on message write ----------------------------------
-- Direct clone of broadcast_notification() (20260823000000): an AFTER write
-- trigger emits the row to the per-conversation private topic. INSERT delivers
-- new messages live; UPDATE propagates edits / soft-delete tombstones. The
-- topic is exactly `chat:{conversation_id}` so the realtime.messages policy
-- below can match it.

create or replace function public.broadcast_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform realtime.broadcast_changes(
        'chat:' || coalesce(new.conversation_id, old.conversation_id)::text,  -- topic
        tg_op,                                                                 -- event ('INSERT'/'UPDATE')
        tg_op,                                                                 -- operation
        tg_table_name,                                                         -- 'messages'
        tg_table_schema,                                                       -- 'public'
        new,
        old
    );
    return null;
end;
$$;

drop trigger if exists broadcast_message_after_write on public.messages;
create trigger broadcast_message_after_write
    after insert or update on public.messages
    for each row execute function public.broadcast_message();

-- Realtime Authorization: an authenticated user may receive Broadcast on a
-- `chat:{id}` topic only if they can access that conversation. The chat analog
-- of the notification policy, gated by access rather than identity.
drop policy if exists "receive accessible conversation broadcasts" on realtime.messages;
create policy "receive accessible conversation broadcasts"
    on realtime.messages
    for select
    to authenticated
    using (
        realtime.messages.extension = 'broadcast'
        and realtime.topic() like 'chat:%'
        and public.can_access_conversation((split_part(realtime.topic(), ':', 2))::uuid)
    );

-- ---- Auto-hide on report threshold ----------------------------------------
-- Clone of media_posts_after_report(): SECURITY DEFINER so the count update
-- fires even though the report is filed on the user-scoped client (the
-- reporter's RLS would otherwise filter the UPDATE on someone else's message).
-- Soft-deletes at 5 reports.

create or replace function public.messages_after_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.messages
        set report_count = report_count + 1,
            deleted_at = case
                when deleted_at is null and report_count + 1 >= 5 then now()
                else deleted_at
            end
        where id = new.message_id;
    return new;
end;
$$;

drop trigger if exists message_reports_after_insert on public.message_reports;
create trigger message_reports_after_insert
    after insert on public.message_reports
    for each row execute function public.messages_after_report();

-- ---- get-or-create RPCs ---------------------------------------------------
-- Creation runs through these SECURITY DEFINER RPCs (not a direct client
-- INSERT): they authorize against the source membership, then upsert against
-- the partial unique indexes, resolving the open-simultaneously race to the
-- existing row (the addFollowEdge idempotent-upsert pattern). No INSERT policy
-- on `conversations` is needed because the definer insert bypasses RLS.

create or replace function public.get_or_create_conversation(p_kind text, p_context_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_uid     uuid := (select auth.uid());
    v_id      uuid;
    v_allowed boolean;
begin
    if v_uid is null then
        raise exception 'Not authenticated' using errcode = '42501';
    end if;
    if p_kind not in ('team', 'event', 'group') then
        raise exception 'Invalid room kind: %', p_kind using errcode = '22023';
    end if;

    v_allowed := case p_kind
        when 'team' then
            exists (select 1 from public.team_members tm
                     where tm.team_id = p_context_id and tm.user_id = v_uid)
            or exists (select 1 from public.teams t
                        where t.id = p_context_id and t.captain_id = v_uid)
        when 'event' then
            public.is_event_host(p_context_id)
            or exists (select 1 from public.event_participants ep
                         join public.event_divisions ed on ed.id = ep.division_id
                        where ed.event_id = p_context_id
                          and ep.user_id = v_uid
                          and ep.role = 'attendee')
        when 'group' then
            exists (select 1 from public.group_members gm
                     where gm.group_id = p_context_id and gm.user_id = v_uid)
        else false
    end;

    if not v_allowed then
        raise exception 'Not a member of this %', p_kind using errcode = '42501';
    end if;

    select id into v_id
      from public.conversations
     where kind = p_kind and context_id = p_context_id and deleted_at is null;
    if v_id is not null then
        return v_id;
    end if;

    insert into public.conversations (kind, context_id, created_by)
        values (p_kind, p_context_id, v_uid)
        on conflict (kind, context_id) where kind <> 'dm'
        do nothing
        returning id into v_id;

    if v_id is null then
        select id into v_id
          from public.conversations
         where kind = p_kind and context_id = p_context_id;
    end if;

    return v_id;
end;
$$;

create or replace function public.get_or_create_dm(p_other_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_uid uuid := (select auth.uid());
    v_id  uuid;
    v_key text;
    v_a   uuid;
    v_b   uuid;
begin
    if v_uid is null then
        raise exception 'Not authenticated' using errcode = '42501';
    end if;
    if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
        raise exception 'Anonymous users cannot start conversations' using errcode = '42501';
    end if;
    if p_other_id = v_uid then
        raise exception 'Cannot start a conversation with yourself' using errcode = '22023';
    end if;
    if not exists (select 1 from public.profiles where id = p_other_id) then
        raise exception 'User not found' using errcode = 'P0002';
    end if;
    if public.is_blocked_pair(v_uid, p_other_id) then
        raise exception 'Cannot message this user' using errcode = '42501';
    end if;

    v_a  := least(v_uid, p_other_id);
    v_b  := greatest(v_uid, p_other_id);
    v_key := v_a::text || ':' || v_b::text;

    select id into v_id from public.conversations where dm_key = v_key;
    if v_id is null then
        insert into public.conversations (kind, dm_key, created_by)
            values ('dm', v_key, v_uid)
            on conflict (dm_key) where kind = 'dm'
            do nothing
            returning id into v_id;

        if v_id is null then
            select id into v_id from public.conversations where dm_key = v_key;
        end if;
    end if;

    -- Materialize both participants — for a DM these rows ARE the access grant.
    insert into public.conversation_participants (conversation_id, user_id)
        values (v_id, v_a), (v_id, v_b)
        on conflict do nothing;

    return v_id;
end;
$$;

grant execute on function public.get_or_create_conversation(text, uuid) to authenticated;
grant execute on function public.get_or_create_dm(uuid)                 to authenticated;

-- ---- RLS ------------------------------------------------------------------

alter table public.conversations            enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;
alter table public.message_reports           enable row level security;
alter table public.user_blocks               enable row level security;

-- conversations: read if you can access it (or admin). No INSERT policy —
-- creation is RPC-only (the definer RPCs bypass RLS). Moderators may soft-delete
-- (teardown) a room.
create policy conversations_select on public.conversations
    for select
    using (public.can_access_conversation(id) or public.is_platform_admin());

create policy conversations_update on public.conversations
    for update
    using (public.can_moderate_conversation(id))
    with check (public.can_moderate_conversation(id));

-- conversation_participants: self-managed state rows (last_read / mute). A user
-- can read participant rows for conversations they can access, and write only
-- their own row.
create policy conversation_participants_select on public.conversation_participants
    for select
    using (
        user_id = (select auth.uid())
        or public.can_access_conversation(conversation_id)
    );

create policy conversation_participants_insert on public.conversation_participants
    for insert
    with check (
        user_id = (select auth.uid())
        and public.can_access_conversation(conversation_id)
    );

create policy conversation_participants_update on public.conversation_participants
    for update
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

-- messages: see non-deleted messages in conversations you can access; the
-- sender and moderators still see their own soft-deleted rows (avoids the
-- SELECT-as-implicit-WITH-CHECK blind spot after a self soft-delete).
create policy messages_select on public.messages
    for select
    using (
        (deleted_at is null and public.can_access_conversation(conversation_id))
        or sender_id = (select auth.uid())
        or public.can_moderate_conversation(conversation_id)
    );

-- INSERT (load-bearing): post as yourself, non-anonymous, into a conversation
-- you can access, and — for DMs — not across a block in either direction.
create policy messages_insert on public.messages
    for insert
    with check (
        sender_id = (select auth.uid())
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
        and public.can_access_conversation(conversation_id)
        and (
            (select c.kind from public.conversations c where c.id = conversation_id) <> 'dm'
            or not exists (
                select 1 from public.conversation_participants p
                 where p.conversation_id = messages.conversation_id
                   and p.user_id <> (select auth.uid())
                   and public.is_blocked_pair((select auth.uid()), p.user_id)
            )
        )
    );

-- UPDATE (edit / soft-delete): sender edits/deletes own; moderator deletes any
-- in their room. No DELETE policy — soft-delete only.
create policy messages_update on public.messages
    for update
    using (
        sender_id = (select auth.uid())
        or public.can_moderate_conversation(conversation_id)
    )
    with check (
        sender_id = (select auth.uid())
        or public.can_moderate_conversation(conversation_id)
    );

-- Reports: any non-anon user who can access the conversation may file one
-- (unique per message). Reporter + admin can read.
create policy message_reports_select on public.message_reports
    for select
    using (
        reporter_user_id = (select auth.uid())
        or public.is_platform_admin()
    );

create policy message_reports_insert on public.message_reports
    for insert
    with check (
        reporter_user_id = (select auth.uid())
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
        and public.can_access_conversation(
            (select m.conversation_id from public.messages m where m.id = message_id)
        )
    );

-- Blocks: self-managed edges (like group_followers).
create policy user_blocks_select on public.user_blocks
    for select
    using (blocker_id = (select auth.uid()));

create policy user_blocks_insert on public.user_blocks
    for insert
    with check (
        blocker_id = (select auth.uid())
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    );

create policy user_blocks_delete on public.user_blocks
    for delete
    using (blocker_id = (select auth.uid()));
