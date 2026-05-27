-- ============================================================================
-- Address Supabase security advisor lints (2026-05-27).
--
-- Context: The Supabase project dashboard flagged four critical findings:
--
--   1. RLS disabled on public.spatial_ref_sys
--      PostGIS installs spatial_ref_sys into the public schema. It's
--      static reference data (EPSG SRID definitions) but PostgREST
--      exposes it because it lives in public. The fix is to enable RLS
--      and add a permissive read policy — the contents are public by
--      definition and writes are owned by the extension.
--
--   2. SECURITY DEFINER view: public.events_view
--      events_view is a thin projection over events that adds
--      lat/lng + attendee_count + team_count. The base events table
--      has its own SELECT policy (events_select) that already permits
--      public reads of published events, and the attendee/team count
--      subqueries hit tables with `using (true)` SELECT policies. So
--      switching the view to security_invoker = on preserves current
--      behavior — anon callers still see the same rows via the base
--      table's RLS — while satisfying the linter.
--
--   3 & 4. SECURITY DEFINER views: profiles_public and
--          event_team_registration_members_public
--      These two are intentionally definer-equivalent (see the
--      preambles in 20260621000000_pii_p1_profiles_public_view.sql and
--      20260622000000_pii_p1_team_members_rls.sql). They project only
--      safe columns and exist precisely to surface that subset to anon
--      callers while the base tables stay RLS-locked for PII. They are
--      suppressed in the Supabase dashboard as intentional and are NOT
--      modified here.
--
-- Impact: No runtime behavior change for the app. events_view now runs
-- with the caller's RLS context (it always relied on a public-by-RLS
-- base table, so the result set is identical for every caller).
-- spatial_ref_sys gains RLS and a read-everyone policy, matching how
-- it was already effectively exposed.
-- ============================================================================

-- ---- 1. spatial_ref_sys: enable RLS with permissive read ------------------

alter table public.spatial_ref_sys enable row level security;

-- Public reference data (EPSG/PROJ definitions). Reads are safe; writes
-- happen via the PostGIS extension owner, not through PostgREST.
create policy spatial_ref_sys_select
  on public.spatial_ref_sys
  for select
  using (true);

-- ---- 2. events_view: convert to security_invoker --------------------------

alter view public.events_view set (security_invoker = on);
