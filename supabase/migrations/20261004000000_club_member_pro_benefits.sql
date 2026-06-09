-- ============================================================================
-- Multi-admin Pro — Club benefits for a group's owners/admins (ADR 0038
-- follow-up O-2a). See docs/audits/monetization.md § Club follow-ups.
--
-- Context: O-2 shipped pooled payouts but Club granted no Pro perks to the
-- group's admins. O-2a makes an active Club subscription confer full Pro
-- benefits on every OWNER/ADMIN of that group, platform-wide — the app gate
-- (hasProBenefits) ORs this in alongside subscription / admin / referral-grant.
--
-- Impact:
--   * New `user_has_club_benefits(p_user_id)` — true when the user is an
--     owner/admin of at least one group with a live Club subscription (same
--     30-day past_due grace as is_pro_host / is_club_group). SECURITY DEFINER so
--     it resolves for any user regardless of the caller; granted to anon +
--     authenticated like the other gate helpers.
--   * NO schema change; this only adds a read helper. The gate widening lives in
--     the app layer (hasProBenefits), so a Club admin gets the fee discount,
--     unlimited paid events, passes/memberships, sponsor/badge, visibility, etc.
--   * Scope is owner/admin only (NOT plain members) — adding someone as a member
--     never grants Pro; promoting them to admin does (the club's choice).
-- ============================================================================

create or replace function public.user_has_club_benefits(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.group_members gm
      join public.group_subscriptions gs on gs.group_id = gm.group_id
     where gm.user_id = p_user_id
       and gm.role in ('owner', 'admin')
       and (
         gs.status in ('trialing', 'active')
         or (
           gs.status = 'past_due'
           and gs.current_period_end is not null
           and gs.current_period_end > now() - interval '30 days'
         )
       )
  )
$$;

grant execute on function public.user_has_club_benefits(uuid) to anon, authenticated;
