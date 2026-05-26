-- ===========================================================================
-- PII audit P1 #5 steps 2 + 3 — event_team_registration_members RLS
--
-- The event_team_registration_members table stores ad-hoc roster slots that
-- may include a captain-supplied email for unregistered teammates. The
-- existing SELECT policy is using (true) — any authenticated client can
-- read every member's email and user_id directly via the Supabase client,
-- regardless of what the React layer renders.
--
-- This migration:
--
--   Step 2: Replace the unrestricted SELECT policy with a
--     captain-or-host-or-self policy that mirrors the existing UPDATE/DELETE
--     policies. Only the team captain, the event host, or the member
--     themselves (user_id = auth.uid()) can read the full row.
--
--   Step 3: Create event_team_registration_members_public — a narrow view
--     that projects only (id, registration_id, display_name, sort_order)
--     with no email or user_id. Public event pages read from this view
--     (via the admin client in loadAdHocRowsCached, which already projects
--     only display_name in the allRegistrations path).
--
-- The view is created as a security-definer-equivalent (no
-- security_invoker = on) so it runs as the view owner and can bypass the
-- now-restrictive base-table RLS, making the safe columns available to
-- anon clients.
-- ===========================================================================

-- ---- Step 2: tighten SELECT policy ----------------------------------------

drop policy event_team_registration_members_select
  on public.event_team_registration_members;

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
        join public.events e on e.id = r.event_id
       where r.id = registration_id
         and e.host_id = auth.uid()
    )
  );

-- ---- Step 3: public narrow view -------------------------------------------

create view public.event_team_registration_members_public as
  select id, registration_id, display_name, sort_order
  from public.event_team_registration_members;

grant select on public.event_team_registration_members_public to anon, authenticated;
