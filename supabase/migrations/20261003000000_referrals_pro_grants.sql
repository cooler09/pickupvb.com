-- ============================================================================
-- Host referrals + comped Pro grants (ADR 0039, monetization O-3).
-- See docs/adr/0039-referrals-pro-grants.md
--
-- Context: reward a host who refers another host that becomes a real organizer
-- (publishes ≥3 paid events) with a free month of Pro. The reward is granted as
-- a "comp" our own Pro gate honors — no Stripe coupon plumbing.
--
-- Impact:
--   * New `pro_grants` — comped Pro time (a row = Pro until `granted_until`).
--     `hasProBenefits()` ORs in an active grant, so a comped host gets every Pro
--     perk for the window (fee discount, unlimited paid events, passes/memberships,
--     sponsor/badge, visibility, …). Writes are admin-only (the milestone hook +
--     any future grant source); the user reads their own.
--   * New `referrals` — one row per (referrer → referred) pair, unique on the
--     referred user (each user is referred at most once). status pending →
--     qualified → rewarded. Writes admin-only (attribution at signup + the
--     ≥3-paid-events milestone); referrer + referred read their own rows.
--   * No change to `is_pro_host` — the grant is honored in the app gate
--     (`hasProBenefits`) via a direct read, so the subscription source of truth
--     stays clean.
-- ============================================================================

-- ---- 1. pro_grants (comped Pro time) ---------------------------------------
create table public.pro_grants (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  granted_until timestamptz not null,
  reason        text not null default 'referral',
  -- the referral (or other source) that earned this grant; informational.
  source_ref    uuid,
  created_at    timestamptz not null default now()
);

create index pro_grants_user_active_idx on public.pro_grants (user_id, granted_until desc);

comment on table public.pro_grants is
  'Comped Pro time (ADR 0039). hasProBenefits() honors a row with granted_until > now(). Admin-write; user reads own.';

alter table public.pro_grants enable row level security;

create policy pro_grants_select_own
  on public.pro_grants for select
  using (auth.uid() = user_id);

-- ---- 2. referrals -----------------------------------------------------------
create table public.referrals (
  id               uuid primary key default uuid_generate_v4(),
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'pending'
                     check (status in ('pending', 'qualified', 'rewarded')),
  qualified_at     timestamptz,
  rewarded_at      timestamptz,
  created_at       timestamptz not null default now(),
  -- A user can be referred at most once (first-touch attribution).
  unique (referred_user_id),
  -- Can't refer yourself.
  constraint referrals_no_self check (referrer_user_id <> referred_user_id)
);

create index referrals_referrer_idx on public.referrals (referrer_user_id, status);

comment on table public.referrals is
  'Host referral attribution (ADR 0039). One row per referred user; qualifies when the referred host publishes ≥3 paid events, rewarding the referrer a Pro month. Admin-write; referrer + referred read own.';

alter table public.referrals enable row level security;

create policy referrals_select_referrer
  on public.referrals for select
  using (auth.uid() = referrer_user_id);

create policy referrals_select_referred
  on public.referrals for select
  using (auth.uid() = referred_user_id);
