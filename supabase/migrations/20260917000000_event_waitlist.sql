-- ============================================================================
-- Capacity waitlist for fixed-capacity open play — see docs/adr/0036-capacity-waitlist.md.
--
-- Context: a full fixed-capacity open-play event rejected the join
-- (CapacityExceededError → ?rsvp=full), even though the signup UI advertised a
-- waitlist. ADR 0036 adds a real FIFO queue owned by the VolleyballEvent
-- aggregate: join-when-full enqueues here; an attendee leaving promotes the head
-- back into event_participants (role='attendee') in the same aggregate save.
--
-- Impact: new table `event_waitlist` (event-level — open play is single-division,
-- but the queue belongs to the whole event). Additive; no existing reads/writes
-- change. Writes flow through SupabaseEventRepository on the service-role client
-- (the join/leave/promote path is app-authorized — pitfall #8), so RLS here is
-- defense-in-depth for any user-scoped read: a user sees their own row, the host
-- sees the whole queue. Run `gen:types` after — the generated types were
-- hand-edited to add this table ahead of the real schema.
-- ============================================================================

create table public.event_waitlist (
    event_id   uuid not null references public.events(id) on delete cascade,
    user_id    uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (event_id, user_id)
);

-- FIFO ordering: the head of the queue is the earliest created_at per event.
create index event_waitlist_fifo_idx on public.event_waitlist (event_id, created_at);

alter table public.event_waitlist enable row level security;

-- A user can see their own queue entry; the event host (or co-host) sees all.
create policy event_waitlist_select on public.event_waitlist
    for select
    using (auth.uid() = user_id or public.is_event_host(event_id));

-- A user manages only their own entry. The promote-on-leave side-effect (which
-- moves another user's row) runs on the service-role client and bypasses these.
create policy event_waitlist_insert on public.event_waitlist
    for insert
    with check (auth.uid() = user_id);

create policy event_waitlist_delete on public.event_waitlist
    for delete
    using (auth.uid() = user_id or public.is_event_host(event_id));
