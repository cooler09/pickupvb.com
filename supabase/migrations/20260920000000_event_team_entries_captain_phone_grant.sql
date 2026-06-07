-- ============================================================================
-- Privacy #16 (P1) — stop exposing walk-in `captain_phone` to public roles.
-- See docs/audits/privacy.md #16.
--
-- Context: the account-less walk-in / host-added team feature (ADR 0017 → ADR
-- 0033) captures a freeform `captain_phone` on `event_team_entries` for a captain
-- who never created an account. That table's row-policy is permissive
-- (`event_team_entries_select … using (deleted_at is null)`, 20260731000000), and
-- the default Supabase table grants give `anon` + `authenticated` table-level
-- SELECT — so a direct REST read
--   GET /rest/v1/event_team_entries?select=name,captain_phone&captain_phone=not.is.null
-- bulk-harvests every live captain's phone number. The rendered event page is
-- safe (the loader only surfaces the phone in the host projection), so this is a
-- table-level exposure, the exact residual the P1 #5 fix closed for the *members*
-- table (email) but never for the phone column on *entries*.
--
-- Impact: revokes the table-level SELECT from anon/authenticated and re-grants
-- column-level SELECT on every column EXCEPT `captain_phone`. The row policy is
-- unchanged (lots of user-scoped reads of name/source/captain_id rely on it), and
-- INSERT/UPDATE/DELETE grants are untouched (captain self-signup keeps working).
-- The only readers of `captain_phone` (loadAdHocRowsCached + the
-- EventTeamRegistration repo) run on the service-role admin client, which has its
-- own grants and is unaffected; the definer views (`events_view`,
-- `event_team_entry_members_public`) read the base table as their owner, not as
-- the calling role, so they're unaffected too. No table/column schema change, so
-- generated types are unaffected. Additive grant change — never edit 20260731000000.
-- ============================================================================

revoke select on public.event_team_entries from anon, authenticated;

-- Re-grant SELECT on the public-safe columns only. `captain_phone` is host-only
-- PII and is deliberately omitted; `captain_display_name` stays (it's the roster
-- name the public event page renders). Keep this list in sync with the table if a
-- future migration adds a column meant to be publicly readable.
grant select (
  id,
  division_id,
  source,
  team_id,
  captain_id,
  captain_display_name,
  display_name,
  registered_at,
  forfeited_at,
  deleted_at,
  created_at,
  updated_at
) on public.event_team_entries to anon, authenticated;
