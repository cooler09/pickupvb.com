-- Tournament free-agent signups: individuals who don't have a team but want
-- to be picked up. Distinct from `event_attendees` (open-play only) and
-- `event_teams` (registered tournament teams).
--
-- Notes column is optional and bounded so captains scanning the list can
-- read at a glance ("setter, can play Sat morning").

create table if not exists public.event_free_agents (
    event_id uuid not null references public.events(id) on delete cascade,
    user_id  uuid not null references auth.users(id) on delete cascade,
    notes    text check (notes is null or char_length(notes) <= 280),
    joined_at timestamptz not null default now(),
    primary key (event_id, user_id)
);

create index if not exists event_free_agents_event_idx
    on public.event_free_agents (event_id);

alter table public.event_free_agents enable row level security;

-- Anyone who can see the event can see its free-agent list. The events
-- table's own RLS already gates which events are visible; selecting from
-- this table is unrestricted in the same way `event_attendees` is.
create policy event_free_agents_select
    on public.event_free_agents for select using (true);

-- A user signs themselves up. The handler enforces that the event is a
-- published tournament; we additionally reject non-tournament signups at
-- the DB layer so a misuse of the API can't pollute the table.
create policy event_free_agents_insert
    on public.event_free_agents for insert with check (
        auth.uid() = user_id
        and exists (
            select 1 from public.events e
             where e.id = event_id
               and e.type = 'tournament'
               and e.status = 'published'
        )
    );

-- Self-removal, plus the host can clear someone (e.g. roster cleanup).
create policy event_free_agents_delete
    on public.event_free_agents for delete using (
        auth.uid() = user_id
        or exists (
            select 1 from public.events e
             where e.id = event_id and e.host_id = auth.uid()
        )
    );
