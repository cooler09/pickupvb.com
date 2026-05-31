-- ============================================================================
-- ADR 0025: Standalone tournament brackets — owner-scoped, event-free.
-- See docs/adr/0025-standalone-brackets.md
--
-- Context: today every bracket hangs off an event division
-- (event_brackets.division_id NOT NULL UNIQUE; the parent event is derived
-- via event_divisions; all RLS/RPCs gate on is_event_host(...)). ADR 0025 lets
-- a signed-in non-anonymous user own a bracket with no event/division and run
-- every existing format. The bracket aggregate + save_bracket RPC are reused
-- unchanged; only the scope identity is generalized. Builds on
-- 20260605300 (per-division uniqueness), 20260729000000 (event_id drop +
-- division-derived RLS), and 20260813000000 (entry_*_id became the sole
-- participant pointer; is_bracket_match_captain resolves via
-- event_team_entries).
--
-- Impact:
--   * event_brackets.division_id becomes NULLABLE; new owner_user_id FK →
--     profiles; a CHECK enforces exactly one of (division_id, owner_user_id).
--   * The bracket-per-division UNIQUE index becomes PARTIAL
--     (WHERE division_id IS NOT NULL) so standalone rows (division_id NULL)
--     don't collide.
--   * NEW competitor table bracket_teams for standalone (typed-in) teams.
--     Event brackets keep using event_team_entries.
--   * bracket_seeds.entry_id / bracket_matches.entry_*_id lose their FK to
--     event_team_entries and become POLYMORPHIC uuids (event_team_entries.id
--     for event brackets, bracket_teams.id for standalone). The aggregate
--     already treats EntryId as opaque. Cost: the on-delete cascade/set-null
--     from event_team_entries into bracket rows is gone — accepted pre-launch
--     (save_bracket is a full-replace; integrity moves to the app layer).
--   * Every bracket write RLS policy gains an owner branch
--     (owner_user_id = auth.uid()) beside the is_event_host branch; INSERT also
--     requires a real (non-anonymous) account, mirroring media_posts_insert.
--     is_bracket_match_captain is unchanged (standalone slots point at
--     bracket_teams, so it returns false — the owner is the sole writer).
--   * Breaks event_divisions!inner bracket selects (would exclude standalone
--     rows) — the infra LEFT-join fix must land in the same PR.
--   * Additive to event brackets: no event read/write path changes.
--
-- NOTE: the owner-aware save_bracket / record_bracket_match_result RPC changes
-- live in the sibling 20260821000100_standalone_bracket_rpcs.sql. Live-scoring
-- support (match_live_scores) is deferred to its own follow-up migration.
-- ============================================================================

-- ---- 1. event_brackets: scope generalization ------------------------------

alter table public.event_brackets
  alter column division_id drop not null;

alter table public.event_brackets
  add column owner_user_id uuid references public.profiles(id) on delete cascade;

-- Exactly one of (division_id, owner_user_id): event-scoped XOR owner-scoped.
alter table public.event_brackets
  add constraint event_brackets_scope_xor
    check (
      (division_id is not null and owner_user_id is null)
      or (division_id is null and owner_user_id is not null)
    );

-- Per-division uniqueness becomes partial so multiple standalone (NULL
-- division) rows don't collide. The index was created as
-- tournament_brackets_division_uidx (20260605000300) and renamed to
-- event_brackets_division_uidx (20260728000000).
drop index if exists public.event_brackets_division_uidx;
create unique index event_brackets_division_uidx
  on public.event_brackets (division_id)
  where division_id is not null;

create index event_brackets_owner_idx
  on public.event_brackets (owner_user_id)
  where owner_user_id is not null;

-- ---- 2. bracket_teams: standalone competitors -----------------------------

create table public.bracket_teams (
  id          uuid primary key default gen_random_uuid(),
  bracket_id  uuid not null references public.event_brackets(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  created_at  timestamptz not null default now()
);

create index bracket_teams_bracket_idx on public.bracket_teams (bracket_id);

-- ---- 3. Polymorphic entry ids: drop FKs to event_team_entries -------------
-- These columns now hold either an event_team_entries.id (event brackets) or a
-- bracket_teams.id (standalone). A single hard FK can't span both tables, and
-- the aggregate never relies on the DB FK for reads. Drop them; integrity is
-- enforced at the application layer (full-replace save). FK names are the
-- Postgres auto-generated `<table>_<column>_fkey`.
alter table public.bracket_seeds
  drop constraint if exists bracket_seeds_entry_id_fkey;

alter table public.bracket_matches
  drop constraint if exists bracket_matches_entry_a_id_fkey,
  drop constraint if exists bracket_matches_entry_b_id_fkey,
  drop constraint if exists bracket_matches_winner_entry_id_fkey,
  drop constraint if exists bracket_matches_work_entry_id_fkey;

-- ---- 4. RLS: add owner branches to the bracket write policies -------------
-- Event brackets: owner_user_id IS NULL, so the owner predicate is NULL and
-- the is_event_host branch decides. Standalone: division_id IS NULL, so the
-- division subquery / join yields NULL, is_event_host(NULL) is false, and the
-- owner predicate decides. SELECT stays public (using(true)) for all.

drop policy if exists event_brackets_insert on public.event_brackets;
create policy event_brackets_insert
  on public.event_brackets for insert
  with check (
    (
      owner_user_id = auth.uid()
      and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    )
    or public.is_event_host((
      select d.event_id from public.event_divisions d where d.id = division_id
    ))
  );

drop policy if exists event_brackets_update on public.event_brackets;
create policy event_brackets_update
  on public.event_brackets for update
  using (
    owner_user_id = auth.uid()
    or public.is_event_host((
      select d.event_id from public.event_divisions d where d.id = division_id
    ))
  )
  with check (
    owner_user_id = auth.uid()
    or public.is_event_host((
      select d.event_id from public.event_divisions d where d.id = division_id
    ))
  );

drop policy if exists event_brackets_delete on public.event_brackets;
create policy event_brackets_delete
  on public.event_brackets for delete
  using (
    owner_user_id = auth.uid()
    or public.is_event_host((
      select d.event_id from public.event_divisions d where d.id = division_id
    ))
  );

-- Child tables: combine the host + owner branches into one EXISTS with a LEFT
-- join on event_divisions so a NULL division (standalone) doesn't drop the row.
drop policy if exists bracket_seeds_write on public.bracket_seeds;
create policy bracket_seeds_write
  on public.bracket_seeds for all
  using (exists (
    select 1
      from public.event_brackets b
      left join public.event_divisions d on d.id = b.division_id
     where b.id = bracket_id
       and (b.owner_user_id = auth.uid() or public.is_event_host(d.event_id))
  ))
  with check (exists (
    select 1
      from public.event_brackets b
      left join public.event_divisions d on d.id = b.division_id
     where b.id = bracket_id
       and (b.owner_user_id = auth.uid() or public.is_event_host(d.event_id))
  ));

drop policy if exists bracket_matches_insert on public.bracket_matches;
create policy bracket_matches_insert
  on public.bracket_matches for insert
  with check (exists (
    select 1
      from public.event_brackets b
      left join public.event_divisions d on d.id = b.division_id
     where b.id = bracket_id
       and (b.owner_user_id = auth.uid() or public.is_event_host(d.event_id))
  ));

drop policy if exists bracket_matches_delete on public.bracket_matches;
create policy bracket_matches_delete
  on public.bracket_matches for delete
  using (exists (
    select 1
      from public.event_brackets b
      left join public.event_divisions d on d.id = b.division_id
     where b.id = bracket_id
       and (b.owner_user_id = auth.uid() or public.is_event_host(d.event_id))
  ));

drop policy if exists bracket_matches_update on public.bracket_matches;
create policy bracket_matches_update
  on public.bracket_matches for update
  using (
    exists (
      select 1
        from public.event_brackets b
        left join public.event_divisions d on d.id = b.division_id
       where b.id = bracket_id
         and (b.owner_user_id = auth.uid() or public.is_event_host(d.event_id))
    )
    or public.is_bracket_match_captain(id)
  )
  with check (
    exists (
      select 1
        from public.event_brackets b
        left join public.event_divisions d on d.id = b.division_id
       where b.id = bracket_id
         and (b.owner_user_id = auth.uid() or public.is_event_host(d.event_id))
    )
    or public.is_bracket_match_captain(id)
  );

drop policy if exists bracket_match_sets_write on public.bracket_match_sets;
create policy bracket_match_sets_write
  on public.bracket_match_sets for all
  using (
    exists (
      select 1
        from public.bracket_matches m
        join public.event_brackets b on b.id = m.bracket_id
        left join public.event_divisions d on d.id = b.division_id
       where m.id = match_id
         and (b.owner_user_id = auth.uid() or public.is_event_host(d.event_id))
    )
    or public.is_bracket_match_captain(match_id)
  )
  with check (
    exists (
      select 1
        from public.bracket_matches m
        join public.event_brackets b on b.id = m.bracket_id
        left join public.event_divisions d on d.id = b.division_id
       where m.id = match_id
         and (b.owner_user_id = auth.uid() or public.is_event_host(d.event_id))
    )
    or public.is_bracket_match_captain(match_id)
  );

-- ---- 5. bracket_teams RLS + realtime --------------------------------------
-- Public read (the watch view shows team names). Writes only by the bracket
-- owner; the real-account gate is already enforced at event_brackets insert,
-- so an owned bracket implies a real account.
alter table public.bracket_teams enable row level security;

create policy bracket_teams_select
  on public.bracket_teams for select using (true);

create policy bracket_teams_write
  on public.bracket_teams for all
  using (exists (
    select 1 from public.event_brackets b
     where b.id = bracket_id and b.owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.event_brackets b
     where b.id = bracket_id and b.owner_user_id = auth.uid()
  ));

alter publication supabase_realtime add table public.bracket_teams;
