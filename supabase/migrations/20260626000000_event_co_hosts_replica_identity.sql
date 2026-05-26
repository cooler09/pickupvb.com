-- ============================================================================
-- event_co_hosts: add primary key so DELETE works under logical replication.
--
-- Context: 20260513000700_groups_and_co_hosts.sql created the table without a
-- primary key (the natural key is split across two partial unique indexes:
-- (event_id, host_user_id) and (event_id, host_group_id), so neither could be
-- promoted to PK). That same migration also adds the table to the
-- `supabase_realtime` publication. Postgres logical replication requires
-- every replicated table to have a REPLICA IDENTITY for UPDATE/DELETE — the
-- default is the primary key, and without one DELETEs fail with:
--   "cannot delete from table ... because it does not have a replica
--    identity and publishes deletes"
-- This surfaced as a 500 on the event detail page whenever an owner clicked
-- "Remove co-host".
--
-- Impact: adds a synthetic `id uuid` PK with a default of gen_random_uuid().
-- Existing rows are backfilled in place. Behaviour for callers is unchanged
-- (the app reads/writes by (event_id, host_user_id|host_group_id), not by
-- the new id), and Realtime subscribers will now receive proper change
-- events for DELETEs.
-- ============================================================================

alter table public.event_co_hosts
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.event_co_hosts
  add constraint event_co_hosts_pkey primary key (id);
