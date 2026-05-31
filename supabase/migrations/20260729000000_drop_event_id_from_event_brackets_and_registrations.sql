-- ============================================================================
-- P2 #6.5 Bundle A — drop denormalized `event_id` from `event_brackets`
-- and `event_team_registrations`.
-- See docs/audits/event-data-model.md § P2 #6.5.
--
-- Context: both tables already carry a NOT NULL `division_id` whose
-- parent event is uniquely determined by `event_divisions.event_id`. The
-- denormalized `event_id` column is pure redundancy — Bundle 118's
-- `assert_division_event_consistency()` trigger
-- (20260710000000_division_centric_registration.sql) only exists to
-- catch drift between the two. Dropping the column eliminates the
-- divergence at the schema level; the trigger goes with it.
--
-- Bundle A only touches the two cheapest tables — pure column drops, no
-- PK reshape. `event_teams` / `event_team_payments` / `event_free_agents`
-- / `event_attendees` PK reshapes are deferred to Bundle B once P1 #3
-- makes `event_attendees.division_id` universally NOT NULL.
--
-- Impact:
--   * Every RLS policy that gated on `event_id` rewrites to subquery
--     through `event_divisions` (one cached PK lookup per evaluation —
--     `event_divisions` is tiny and stays in shared buffers).
--   * `event_team_registrations_source_idx` (event_id, source) is
--     replaced with `(division_id, source)`; the host-panel walk-in
--     filter is per-division anyway.
--   * `event_brackets_event_idx` deleted — `division_uidx` already
--     covers the only lookup path.
--   * `assert_division_event_consistency` trigger on
--     `event_team_registrations` is dropped. Bundle B drops the
--     remaining three triggers and the function.
--   * Domain repos (`SupabaseEventTeamRegistrationRepository`,
--     `SupabaseBracketRepository`) stop reading/writing `event_id` on
--     these two tables and derive it from `event_divisions` on load.
-- ============================================================================

-- ---- 1. event_team_registrations ------------------------------------------

-- 1a. Drop the consistency trigger — column it gates on is going away.
drop trigger if exists event_team_registrations_assert_division
  on public.event_team_registrations;

-- 1b. Rewrite RLS policies that reference event_id.
drop policy if exists event_team_registrations_insert on public.event_team_registrations;
create policy event_team_registrations_insert
  on public.event_team_registrations for insert with check (
    -- (a) Captain self-signup (Bundle 119 + Bundle 120 ad_hoc gate).
    (
      source = 'captain'
      and auth.uid() = captain_id
      and exists (
        select 1
          from public.event_divisions d
          join public.events e on e.id = d.event_id
         where d.id = division_id
           and e.status = 'published'
           and d.team_registration_mode = 'ad_hoc'
      )
    )
    or
    -- (b) Host-initiated insert for source in ('host','walk_in') on an
    --     ad_hoc division.
    (
      source in ('host', 'walk_in')
      and exists (
        select 1
          from public.event_divisions d
          join public.events e on e.id = d.event_id
         where d.id = division_id
           and e.status = 'published'
           and d.team_registration_mode = 'ad_hoc'
           and e.host_id = auth.uid()
      )
    )
  );

drop policy if exists event_team_registrations_update on public.event_team_registrations;
create policy event_team_registrations_update
  on public.event_team_registrations for update using (
    auth.uid() = captain_id
    or exists (
      select 1
        from public.event_divisions d
        join public.events e on e.id = d.event_id
       where d.id = division_id
         and e.host_id = auth.uid()
    )
  );

drop policy if exists event_team_registrations_delete on public.event_team_registrations;
create policy event_team_registrations_delete
  on public.event_team_registrations for delete using (
    auth.uid() = captain_id
    or exists (
      select 1
        from public.event_divisions d
        join public.events e on e.id = d.event_id
       where d.id = division_id
         and e.host_id = auth.uid()
    )
  );

-- 1c. Members policies that reach through the parent registration to
--     `r.event_id` rewrite to reach through the division.
drop policy if exists event_team_registration_members_update on public.event_team_registration_members;
create policy event_team_registration_members_update
  on public.event_team_registration_members for update using (
    exists (
      select 1 from public.event_team_registrations r
       where r.id = registration_id
         and (
           r.captain_id = auth.uid()
           or exists (
             select 1
               from public.event_divisions d
               join public.events e on e.id = d.event_id
              where d.id = r.division_id
                and e.host_id = auth.uid()
           )
         )
    )
  );

drop policy if exists event_team_registration_members_delete on public.event_team_registration_members;
create policy event_team_registration_members_delete
  on public.event_team_registration_members for delete using (
    exists (
      select 1 from public.event_team_registrations r
       where r.id = registration_id
         and (
           r.captain_id = auth.uid()
           or exists (
             select 1
               from public.event_divisions d
               join public.events e on e.id = d.event_id
              where d.id = r.division_id
                and e.host_id = auth.uid()
           )
         )
    )
  );

-- 1d. Members SELECT policy (Bundle 22 / PII P1) reached through
--     `r.event_id` to find the event host. Rewrite via division.
drop policy if exists event_team_registration_members_select on public.event_team_registration_members;
create policy event_team_registration_members_select
  on public.event_team_registration_members for select using (
    -- Own row (member is a registered user)
    auth.uid() = user_id
    -- Captain of the registration
    or exists (
      select 1 from public.event_team_registrations r
       where r.id = registration_id
         and r.captain_id = auth.uid()
    )
    -- Event host
    or exists (
      select 1
        from public.event_team_registrations r
        join public.event_divisions d on d.id = r.division_id
        join public.events e on e.id = d.event_id
       where r.id = registration_id
         and e.host_id = auth.uid()
    )
  );

-- 1e. Replace the (event_id, source) composite index with (division_id, source).
drop index if exists public.event_team_registrations_source_idx;
create index event_team_registrations_source_idx
  on public.event_team_registrations (division_id, source);

-- 1f. Drop the legacy event_id supporting index.
drop index if exists public.event_team_registrations_event_idx;

-- 1g. Drop the FK + column.
alter table public.event_team_registrations
  drop constraint if exists event_team_registrations_event_id_fkey;
alter table public.event_team_registrations
  drop column event_id;

-- ---- 2. event_brackets ----------------------------------------------------

-- 2a. Rewrite RLS policies that gated on event_id via is_event_host(event_id).
drop policy if exists event_brackets_insert on public.event_brackets;
create policy event_brackets_insert
  on public.event_brackets for insert
  with check (
    public.is_event_host((
      select d.event_id from public.event_divisions d where d.id = division_id
    ))
  );

drop policy if exists event_brackets_update on public.event_brackets;
create policy event_brackets_update
  on public.event_brackets for update
  using (
    public.is_event_host((
      select d.event_id from public.event_divisions d where d.id = division_id
    ))
  )
  with check (
    public.is_event_host((
      select d.event_id from public.event_divisions d where d.id = division_id
    ))
  );

drop policy if exists event_brackets_delete on public.event_brackets;
create policy event_brackets_delete
  on public.event_brackets for delete
  using (
    public.is_event_host((
      select d.event_id from public.event_divisions d where d.id = division_id
    ))
  );

-- 2b. Rewrite child-table RLS policies (bracket_seeds, bracket_matches,
--     bracket_match_sets) that reach through event_brackets.event_id —
--     the 20260514000400_tournament_brackets.sql definitions survived
--     the rename in 20260728000000 untouched and still reference the
--     legacy column. Derive event_id via event_divisions instead.
drop policy if exists bracket_seeds_write on public.bracket_seeds;
create policy bracket_seeds_write
  on public.bracket_seeds for all
  using (exists (
    select 1
      from public.event_brackets b
      join public.event_divisions d on d.id = b.division_id
     where b.id = bracket_id and public.is_event_host(d.event_id)
  ))
  with check (exists (
    select 1
      from public.event_brackets b
      join public.event_divisions d on d.id = b.division_id
     where b.id = bracket_id and public.is_event_host(d.event_id)
  ));

drop policy if exists bracket_matches_insert on public.bracket_matches;
create policy bracket_matches_insert
  on public.bracket_matches for insert
  with check (exists (
    select 1
      from public.event_brackets b
      join public.event_divisions d on d.id = b.division_id
     where b.id = bracket_id and public.is_event_host(d.event_id)
  ));

drop policy if exists bracket_matches_delete on public.bracket_matches;
create policy bracket_matches_delete
  on public.bracket_matches for delete
  using (exists (
    select 1
      from public.event_brackets b
      join public.event_divisions d on d.id = b.division_id
     where b.id = bracket_id and public.is_event_host(d.event_id)
  ));

drop policy if exists bracket_matches_update on public.bracket_matches;
create policy bracket_matches_update
  on public.bracket_matches for update
  using (
    exists (
      select 1
        from public.event_brackets b
        join public.event_divisions d on d.id = b.division_id
       where b.id = bracket_id and public.is_event_host(d.event_id)
    )
    or public.is_bracket_match_captain(id)
  )
  with check (
    exists (
      select 1
        from public.event_brackets b
        join public.event_divisions d on d.id = b.division_id
       where b.id = bracket_id and public.is_event_host(d.event_id)
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
        join public.event_divisions d on d.id = b.division_id
       where m.id = match_id and public.is_event_host(d.event_id)
    )
    or public.is_bracket_match_captain(match_id)
  )
  with check (
    exists (
      select 1
        from public.bracket_matches m
        join public.event_brackets b on b.id = m.bracket_id
        join public.event_divisions d on d.id = b.division_id
       where m.id = match_id and public.is_event_host(d.event_id)
    )
    or public.is_bracket_match_captain(match_id)
  );

-- 2c. Drop the event_idx — division_uidx already covers the only lookup path.
drop index if exists public.event_brackets_event_idx;

-- 2d. Drop the FK + column. The original `event_id unique` constraint was
--     already replaced by `event_brackets_division_uidx` in
--     20260605000300_bracket_per_division.sql, so there is no unique
--     constraint to retire here.
alter table public.event_brackets
  drop constraint if exists event_brackets_event_id_fkey;
alter table public.event_brackets
  drop column event_id;
