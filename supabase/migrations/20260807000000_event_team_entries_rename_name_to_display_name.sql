-- ============================================================================
-- event_team_entries: rename `name` -> `display_name`.
--
-- Context: every consumer of this table (SupabaseEventTeamRegistrationRepository
-- and the event-detail loader's loadAdHocRowsCached) already selects and writes
-- `display_name`, matching the convention used by sibling tables
-- (event_team_entry_members.display_name, profiles.display_name). The column
-- was originally created as `name` in 20260731000000_collapse_team_registration_tables.sql
-- and the divergence was hidden by `as never` casts in the boundary layer, so
-- typecheck never caught the missing column. Walk-in inserts would fail at
-- runtime today.
--
-- Impact: column rename only. Inline CHECK predicates (char_length etc.)
-- and the event_team_entries_captain_identity composite check are updated
-- automatically by Postgres on column rename. No bridge view rebuild needed
-- (events_view and metro_health_weekly select id/division_id/deleted_at, not
-- the renamed column). Generated TS types are patched in the same change-set.
-- ============================================================================

alter table public.event_team_entries
  rename column name to display_name;
