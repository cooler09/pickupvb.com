-- ============================================================================
-- Soft-delete for groups, teams, and broadcasts.
-- Closes data-lifecycle.md audit items P2 #1 (groups), P2 #2 (teams), and the
-- schema slice of P3 #1 / P2 #3 (broadcasts).
--
-- Context: groups and teams have no in-product delete path today, so creators
-- (and the e2e suite) leak rows forever. Broadcasts are immutable post-send
-- so a host can't retract a typo from their own audit list. Mirrors the
-- `profiles.deleted_at` pattern landed in 20260620000000 — partial index,
-- nullable timestamptz, SELECT-policy filter so the column becomes the source
-- of truth for "hidden from product surfaces" without each call site having
-- to remember to filter.
--
-- Impact:
--   - Adds nullable `deleted_at timestamptz` + partial index to `groups`,
--     `teams`, `broadcasts`.
--   - Rewrites SELECT policies so soft-deleted rows disappear from every
--     read path (anon + signed-in). The `service_role` admin client still
--     bypasses RLS and sees deleted rows (used by maintenance/cleanup).
--   - Mutating policies (insert/update/delete) are unchanged — owners can
--     still UPDATE the row to flip `deleted_at` because the WITH CHECK on
--     `groups_update` / `teams_update` doesn't reference `deleted_at`.
--   - Slug uniqueness is unchanged: a soft-deleted group/team's slug stays
--     reserved. Slug reclamation is intentionally deferred — see the
--     follow-ups list in docs/journal/2026-05-26-bundle-93.md.
--   - No backfill: existing rows have NULL `deleted_at`, which RLS treats
--     as "live" — no behavioural change for them.
-- ============================================================================

-- ─── groups ────────────────────────────────────────────────────────────────
alter table public.groups
  add column deleted_at timestamptz;

create index groups_deleted_at_idx
  on public.groups (deleted_at)
  where deleted_at is not null;

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select
  using (deleted_at is null);

-- ─── teams ─────────────────────────────────────────────────────────────────
alter table public.teams
  add column deleted_at timestamptz;

create index teams_deleted_at_idx
  on public.teams (deleted_at)
  where deleted_at is not null;

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select
  using (deleted_at is null);

-- ─── broadcasts ────────────────────────────────────────────────────────────
alter table public.broadcasts
  add column deleted_at timestamptz;

create index broadcasts_deleted_at_idx
  on public.broadcasts (deleted_at)
  where deleted_at is not null;

drop policy if exists broadcasts_select_sender on public.broadcasts;
create policy broadcasts_select_sender on public.broadcasts for select
  using (auth.uid() = sender_id and deleted_at is null);

-- Allow the sender to update their own broadcast row. Today the only
-- user-facing UPDATE is the `hideBroadcastAction` setting `deleted_at`;
-- the sent_at fan-out continues to run via the admin client. WITH CHECK
-- mirrors USING so a sender can't reassign the row to another sender.
create policy broadcasts_update_sender on public.broadcasts for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);
