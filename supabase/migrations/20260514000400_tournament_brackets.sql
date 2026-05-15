-- Tournament brackets.
--
-- One bracket per event (tournament). Format-agnostic: matches carry an
-- optional `pool` label (round-robin / pool play), an optional `bracket_side`
-- (winners/losers for double-elim), a round number, and slot wiring so the
-- generator can describe how a winner advances.
--
-- Set-by-set scores are stored separately; the bracket aggregate computes
-- the match winner from set wins.
--
-- Permissions:
--   * Anyone who can see the event can see the bracket and its matches.
--   * Hosts/co-hosts of the event can create/regenerate the bracket and
--     edit any match.
--   * Captains of either team in a match can record results for that match.

create table if not exists public.tournament_brackets (
    id          uuid primary key default gen_random_uuid(),
    event_id    uuid not null unique references public.events(id) on delete cascade,
    format      text not null check (format in (
        'single_elimination',
        'double_elimination',
        'round_robin',
        'pool_play_playoff',
        'swiss'
    )),
    config      jsonb not null default '{}'::jsonb,
    status      text not null default 'setup'
        check (status in ('setup', 'active', 'completed')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists tournament_brackets_event_idx
    on public.tournament_brackets (event_id);

create table if not exists public.bracket_seeds (
    bracket_id uuid not null references public.tournament_brackets(id) on delete cascade,
    team_id    uuid not null references public.teams(id) on delete cascade,
    seed       int  not null check (seed >= 1),
    pool       text,
    primary key (bracket_id, team_id),
    unique (bracket_id, seed)
);

create index if not exists bracket_seeds_bracket_idx
    on public.bracket_seeds (bracket_id);

create table if not exists public.bracket_matches (
    id              uuid primary key default gen_random_uuid(),
    bracket_id      uuid not null references public.tournament_brackets(id) on delete cascade,
    round           int  not null,
    match_number    int  not null,
    pool            text,
    bracket_side    text check (bracket_side is null or bracket_side in ('winners', 'losers', 'final')),
    team_a_id       uuid references public.teams(id) on delete set null,
    team_b_id       uuid references public.teams(id) on delete set null,
    winner_team_id  uuid references public.teams(id) on delete set null,
    status          text not null default 'pending'
        check (status in ('pending', 'in_progress', 'completed', 'bye')),
    -- Wiring: when this match completes, the winner (or loser, for losers
    -- bracket feeds) is placed into another match's slot.
    advances_to_match_id uuid references public.bracket_matches(id) on delete set null,
    advances_to_slot     text check (advances_to_slot is null or advances_to_slot in ('a', 'b')),
    loser_advances_to_match_id uuid references public.bracket_matches(id) on delete set null,
    loser_advances_to_slot     text check (loser_advances_to_slot is null or loser_advances_to_slot in ('a', 'b')),
    scheduled_at    timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create unique index if not exists bracket_matches_unique_position
    on public.bracket_matches (
        bracket_id,
        round,
        match_number,
        coalesce(pool, ''),
        coalesce(bracket_side, '')
    );

create index if not exists bracket_matches_bracket_idx
    on public.bracket_matches (bracket_id);
create index if not exists bracket_matches_team_a_idx
    on public.bracket_matches (team_a_id);
create index if not exists bracket_matches_team_b_idx
    on public.bracket_matches (team_b_id);

create table if not exists public.bracket_match_sets (
    match_id      uuid not null references public.bracket_matches(id) on delete cascade,
    set_number    int  not null check (set_number >= 1),
    team_a_score  int  not null check (team_a_score >= 0),
    team_b_score  int  not null check (team_b_score >= 0),
    primary key (match_id, set_number)
);

-- ---------- helper: is the current user a host/co-host of the event? ----------
create or replace function public.is_event_host(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.events e
         where e.id = p_event_id
           and (
                e.host_id = auth.uid()
             or exists (
                    select 1 from public.event_co_hosts ch
                     where ch.event_id = e.id
                       and ch.host_user_id = auth.uid()
                )
             or exists (
                    select 1 from public.event_co_hosts ch
                       join public.group_members gm
                            on gm.group_id = ch.host_group_id
                     where ch.event_id = e.id
                       and ch.host_group_id is not null
                       and gm.user_id = auth.uid()
                       and gm.role in ('owner', 'admin')
                )
           )
    );
$$;

-- ---------- helper: is current user a captain of either team on the match? ----------
create or replace function public.is_bracket_match_captain(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
          from public.bracket_matches m
          left join public.teams a on a.id = m.team_a_id
          left join public.teams b on b.id = m.team_b_id
         where m.id = p_match_id
           and (a.captain_id = auth.uid() or b.captain_id = auth.uid())
    );
$$;

-- ---------- RLS ----------
alter table public.tournament_brackets enable row level security;
alter table public.bracket_seeds       enable row level security;
alter table public.bracket_matches     enable row level security;
alter table public.bracket_match_sets  enable row level security;

create policy tournament_brackets_select
    on public.tournament_brackets for select using (true);

create policy tournament_brackets_insert
    on public.tournament_brackets for insert
    with check (public.is_event_host(event_id));

create policy tournament_brackets_update
    on public.tournament_brackets for update
    using (public.is_event_host(event_id))
    with check (public.is_event_host(event_id));

create policy tournament_brackets_delete
    on public.tournament_brackets for delete
    using (public.is_event_host(event_id));

create policy bracket_seeds_select
    on public.bracket_seeds for select using (true);

create policy bracket_seeds_write
    on public.bracket_seeds for all
    using (exists (
        select 1 from public.tournament_brackets b
         where b.id = bracket_id and public.is_event_host(b.event_id)
    ))
    with check (exists (
        select 1 from public.tournament_brackets b
         where b.id = bracket_id and public.is_event_host(b.event_id)
    ));

create policy bracket_matches_select
    on public.bracket_matches for select using (true);

create policy bracket_matches_insert
    on public.bracket_matches for insert
    with check (exists (
        select 1 from public.tournament_brackets b
         where b.id = bracket_id and public.is_event_host(b.event_id)
    ));

create policy bracket_matches_delete
    on public.bracket_matches for delete
    using (exists (
        select 1 from public.tournament_brackets b
         where b.id = bracket_id and public.is_event_host(b.event_id)
    ));

-- Update by either: hosts of the event, OR a captain of one of the two teams.
create policy bracket_matches_update
    on public.bracket_matches for update
    using (
        exists (
            select 1 from public.tournament_brackets b
             where b.id = bracket_id and public.is_event_host(b.event_id)
        )
        or public.is_bracket_match_captain(id)
    )
    with check (
        exists (
            select 1 from public.tournament_brackets b
             where b.id = bracket_id and public.is_event_host(b.event_id)
        )
        or public.is_bracket_match_captain(id)
    );

create policy bracket_match_sets_select
    on public.bracket_match_sets for select using (true);

-- Match sets follow the match: hosts always, captains of either team.
create policy bracket_match_sets_write
    on public.bracket_match_sets for all
    using (
        exists (
            select 1 from public.bracket_matches m
              join public.tournament_brackets b on b.id = m.bracket_id
             where m.id = match_id and public.is_event_host(b.event_id)
        )
        or public.is_bracket_match_captain(match_id)
    )
    with check (
        exists (
            select 1 from public.bracket_matches m
              join public.tournament_brackets b on b.id = m.bracket_id
             where m.id = match_id and public.is_event_host(b.event_id)
        )
        or public.is_bracket_match_captain(match_id)
    );

alter publication supabase_realtime add table public.tournament_brackets;
alter publication supabase_realtime add table public.bracket_matches;
alter publication supabase_realtime add table public.bracket_match_sets;
