-- ============================================================================
-- Pro Host subscription (Phase 3 of monetization)
-- ----------------------------------------------------------------------------
-- Tracks per-user Stripe Billing subscription state. The webhook keeps this
-- table in sync; the app reads it to gate perks.
--
-- Perks at launch:
--   1. Platform fee 2.5% instead of 5% on paid events
--   2. Free hosts capped at 1 paid event per rolling 30 days; Pro = unlimited
--   3. CSV attendee export
--
-- Stripe products are created out-of-band in the Stripe dashboard; the
-- monthly + yearly price IDs are passed via env vars
-- (STRIPE_PRO_MONTHLY_PRICE_ID / STRIPE_PRO_YEARLY_PRICE_ID).
-- ============================================================================

create table public.host_subscriptions (
  user_id              uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id   text not null,
  stripe_subscription_id text,
  -- Stripe statuses: trialing | active | past_due | canceled | unpaid |
  -- incomplete | incomplete_expired | paused. We only treat trialing+active
  -- (and past_due within grace) as "Pro".
  status               text not null default 'incomplete'
    check (status in (
      'trialing','active','past_due','canceled','unpaid',
      'incomplete','incomplete_expired','paused'
    )),
  -- 'monthly' | 'yearly' — denormalized from the price id for quick reads.
  plan                 text check (plan in ('monthly','yearly')),
  current_period_end   timestamptz,
  trial_end            timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index host_subscriptions_customer_idx
  on public.host_subscriptions (stripe_customer_id);
create unique index host_subscriptions_subscription_idx
  on public.host_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Service-role-only (writes happen from the webhook + onboarding action,
-- both of which use the admin client). Reads also go through the admin
-- client via lib/pro.ts; we don't expose RLS-readable rows.
alter table public.host_subscriptions enable row level security;
-- No policies = no rows visible to anon/authenticated roles.

-- ---- Helper: is the user currently a Pro host? -----------------------------
-- Returns true for trialing, active, and past_due (Stripe gives 3 retry
-- attempts over ~3 weeks before flipping to unpaid/canceled — we let the
-- host keep perks during that grace window).
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
       and status in ('trialing', 'active', 'past_due')
  )
$$;
grant execute on function public.is_pro_host(uuid) to anon, authenticated;

-- ---- Helper: count of paid events the user hosted in the last 30 days -----
-- Used by the free-tier 1-paid-event-per-month cap.
create or replace function public.host_paid_event_count_30d(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.events
   where host_id = p_user_id
     and price_cents > 0
     and created_at >= now() - interval '30 days'
$$;
grant execute on function public.host_paid_event_count_30d(uuid) to anon, authenticated;
