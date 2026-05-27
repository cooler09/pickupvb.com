-- ============================================================================
-- Promote ad-hoc team registrations to first-class `teams` rows
-- See docs/adr/0013-team-identity-and-history.md (Option B).
--
-- Context: ad-hoc registrations (ADR 0007) live in
-- `event_team_registrations` and were never reconciled into `event_teams`,
-- so the bracket reader (`SupabaseBracketRepository.listRegisteredTeams`,
-- which only scans `event_teams`) and the `events_view.team_count`
-- expression both reported 0 walk-in teams. Worse, `bracket_seeds.team_id`
-- is a FK to `teams.id`, so even after fixing the read, ad-hoc rows could
-- not be seeded into a generated bracket. Bundle 104's "the walk-in lands
-- in the seeding list" assertion was wrong — there was no materialization
-- between the two tables.
--
-- Impact: every ad-hoc registration now has a backing `teams` row
-- (captain + format from the event) and an `event_teams` link row. New
-- `event_team_registrations.team_id` column carries the link both ways so
-- the infrastructure adapter can: (1) create the team on first save,
-- (2) rename the team when the registration is renamed,
-- (3) remove the `event_teams` link on hard/soft delete. The `teams` row
-- itself is preserved on withdraw so the captain's history stays intact
-- (ADR 0013). Existing roster-mode flows are untouched — `RegisterTeam`
-- still owns its own `teams` + `event_teams` writes.
-- ============================================================================

alter table public.event_team_registrations
  add column if not exists team_id uuid references public.teams(id) on delete set null;

create index if not exists event_team_registrations_team_id_idx
  on public.event_team_registrations (team_id);

-- ---- Backfill --------------------------------------------------------------
-- Every active (non-soft-deleted) ad-hoc registration without a backing
-- team gets one. Soft-deleted rows stay un-promoted on purpose: their
-- counterpart `event_teams` row should be gone, and re-materializing now
-- would inflate counts.
do $$
declare
  r           record;
  evt_format  public.format;
  new_team_id uuid;
begin
  for r in
    select id, event_id, division_id, captain_id, name
      from public.event_team_registrations
     where team_id is null
       and deleted_at is null
  loop
    select format into evt_format from public.events where id = r.event_id;
    if evt_format is null then
      -- Defensive: event was hard-deleted but the registration row survived
      -- (shouldn't happen under current FKs, but skip rather than crash).
      continue;
    end if;

    insert into public.teams (captain_id, name, format)
         values (r.captain_id, r.name, evt_format)
      returning id into new_team_id;

    update public.event_team_registrations
       set team_id = new_team_id
     where id = r.id;

    insert into public.event_teams (event_id, team_id, division_id)
         values (r.event_id, new_team_id, r.division_id)
    on conflict (event_id, team_id) do nothing;
  end loop;
end $$;
