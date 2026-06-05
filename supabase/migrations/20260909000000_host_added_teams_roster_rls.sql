-- ============================================================================
-- ADR 0033 — Host-added, account-less teams on roster (league) divisions.
-- See docs/adr/0033-host-managed-account-less-team-entries.md
--
-- Context: ADR 0017 introduced host-added `walk_in` team entries (team_id null,
-- captain_id null, freeform captain name/phone) but restricted them to ad-hoc
-- divisions. ADR 0033 generalizes them to roster divisions so a league host can
-- add teams that registered / paid off-platform (the common league path). The
-- application performs the insert through the admin client with the host
-- authorized in the app layer (walk-in-team-actions.ts ->
-- RegisterWalkInTeamHandler), so this RLS change is defense-in-depth: it keeps
-- the insert policy correct for the eventual user-context flip ADR 0017 §5
-- anticipated, and stops the policy from contradicting what the app now does.
--
-- Impact: rewrites `event_team_entries_insert` to add a fourth branch — the
-- primary event host may insert a `source = 'walk_in'` entry on a published
-- *roster* division they host (previously ad-hoc only). The three existing
-- branches (captain ad-hoc self-signup, captain roster-team registration, host
-- ad-hoc/walk-in) are unchanged. No table/column changes, so generated types
-- are unaffected. Co-host inserts continue via the admin client (RLS bypass),
-- matching the collapse-migration (20260731000000) posture.
-- ============================================================================

drop policy if exists event_team_entries_insert on public.event_team_entries;

create policy event_team_entries_insert
  on public.event_team_entries for insert with check (
    (
      -- (a) Captain ad-hoc self-signup on an ad_hoc division.
      source = 'ad_hoc'
      and auth.uid() = captain_id
      and exists (
        select 1
          from public.events e
          join public.event_divisions d on d.event_id = e.id
         where d.id = division_id
           and e.status = 'published'
           and d.team_registration_mode = 'ad_hoc'
      )
    )
    or
    (
      -- (b) Captain registers a persistent team on a roster division.
      source = 'roster'
      and auth.uid() = captain_id
      and exists (
        select 1 from public.teams t
         where t.id = team_id and t.captain_id = auth.uid()
      )
      and exists (
        select 1
          from public.events e
          join public.event_divisions d on d.event_id = e.id
         where d.id = division_id
           and e.status = 'published'
           and d.team_registration_mode = 'roster'
      )
    )
    or
    (
      -- (c) Host adds an ad-hoc / walk-in team on an ad_hoc division.
      source in ('ad_hoc', 'walk_in')
      and exists (
        select 1
          from public.events e
          join public.event_divisions d on d.event_id = e.id
         where d.id = division_id
           and e.status = 'published'
           and d.team_registration_mode = 'ad_hoc'
           and e.host_id = auth.uid()
      )
    )
    or
    (
      -- (d) Host adds an account-less team on a roster division (leagues, ADR 0033).
      source = 'walk_in'
      and exists (
        select 1
          from public.events e
          join public.event_divisions d on d.event_id = e.id
         where d.id = division_id
           and e.status = 'published'
           and d.team_registration_mode = 'roster'
           and e.host_id = auth.uid()
      )
    )
  );
