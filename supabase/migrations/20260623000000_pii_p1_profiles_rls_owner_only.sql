-- ============================================================================
-- PII audit P1 #4 step 3 — Tighten profiles SELECT RLS to owner-only.
--
-- Context: Step 1 (20260621) created profiles_public, a view that exposes
-- only safe columns (no first_name, last_name, business_name, tax_id, etc.)
-- to anon + authenticated callers. Step 2 (app-layer, bundle 89) migrated
-- every public-facing query to read from profiles_public instead of the
-- base table. This migration completes the hardening by replacing the
-- permissive `using (true)` SELECT policy with a restrictive one that only
-- lets a row's owner or a platform admin read the full base-table row.
--
-- The profiles_public view is SECURITY DEFINER-equivalent (created without
-- security_invoker = on) so it continues to serve public reads regardless
-- of the base-table RLS change. Server actions that need owner-scoped fields
-- (profile edit page, receipts page for buyer's own data) go through the
-- user-scoped Supabase client whose JWT satisfies auth.uid() = id. Reads
-- that need another user's privileged fields (receipt page for host's
-- business info, team-invite auto-accept preference) already use the admin
-- client after the app-layer changes in this bundle.
--
-- Impact: Any remaining query that reads from profiles without an auth
-- context (anon/service, wrong user_id) will now return no rows. Public
-- pages all go through profiles_public, so there is no user-visible
-- regression for logged-out or logged-in visitors.
-- ============================================================================

-- Replace the blanket SELECT policy with owner + platform-admin access.
-- is_platform_admin() is SECURITY DEFINER so it won't recurse through RLS.
drop policy profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select
  using (
    auth.uid() = id
    or public.is_platform_admin()
  );
