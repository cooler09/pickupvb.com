-- ============================================================================
-- is_pro_host: add a current_period_end backstop to the past_due grace branch.
-- See docs/audits/monetization.md M-2.
--
-- Context: is_pro_host (20260517000000_pro_subscriptions.sql) grants Pro for
-- status in ('trialing','active','past_due') and reads nothing else. The
-- past_due grace is deliberate — Stripe retries a failing card for ~3 weeks and
-- we let the host keep perks during that window. But the SAFETY of that grace
-- was entirely outsourced to Stripe Dashboard dunning config: if "Manage failed
-- payments" is left on "do nothing" (a valid setting) instead of "cancel
-- subscription after retries", a host whose card permanently fails stays
-- past_due forever and keeps every Pro perk (unlimited paid events, 2.5% fee,
-- sponsor/badge slots, …) for free. A missed terminal subscription webhook
-- (customer.subscription.deleted / .updated → canceled) has the same effect:
-- the row never leaves past_due. There was no code-level backstop.
--
-- Impact: trialing/active are UNCHANGED. The past_due branch now additionally
-- requires current_period_end to be within a 30-day grace of now(), so an
-- abandoned past_due row self-expires ~30d past the paid period regardless of
-- dunning config or webhook delivery (Stripe's retry window is ~3 weeks, so a
-- still-retrying sub stays Pro; a dead one drops). A null current_period_end on
-- a past_due row falls through to NOT Pro (defensive — we can't prove the paid
-- period is still live). Signature unchanged → no app-layer / type changes.
-- The required Stripe dunning setting is also documented in
-- docs/integrations.md § Stripe so the ops side of the grace is explicit.
-- ============================================================================

create or replace function public.is_pro_host(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.host_subscriptions
     where user_id = p_user_id
       and (
         status in ('trialing', 'active')
         or (
           status = 'past_due'
           and current_period_end is not null
           and current_period_end > now() - interval '30 days'
         )
       )
  )
$$;

grant execute on function public.is_pro_host(uuid) to anon, authenticated;
