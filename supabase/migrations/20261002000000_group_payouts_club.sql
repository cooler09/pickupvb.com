-- ============================================================================
-- Group payouts + Club tier — pooled payouts for clubs (ADR 0038).
-- See docs/adr/0038-group-payouts-club-tier.md
--
-- Context: today every event pays out to one user (events.host_id); a club that
-- wants pooled payouts must nominate a "treasurer" and create every event as
-- them (payments.md § Open question). This adds a paid Club tier whose marquee
-- perk is a group-OWNED Stripe Connect account that group-hosted events can opt
-- to pay out to. The routing change is opt-in + immutable-once-sold, so NOTHING
-- about existing events' payouts changes.
--
-- Impact:
--   * New `group_stripe_accounts` (group's Connect account, mirror of
--     host_stripe_accounts keyed by group_id). RLS: owner/admin read; writes are
--     admin-only (onboarding action + account.updated webhook). The payout
--     resolver reads it on the admin client (the buyer isn't a group admin).
--   * New `group_subscriptions` (the Club subscription, mirror of
--     host_subscriptions). RLS owner/admin read; admin writes (webhook).
--   * New `events.payout_group_id` (nullable FK → groups) — the opt-in payout
--     destination. NULL (the default, and every existing row) = pay out to
--     events.host_id, unchanged. on delete set null so a deleted group reverts
--     the event to host payout (the safe fallback owner).
--   * New `is_club_group(group)` — Club status check with the same 30-day
--     past_due period-end backstop as is_pro_host (monetization M-2).
--   * NO change to the platform fee (still keyed on events.host_id's tier) and NO
--     change to passes/memberships (host-user products stay user-routed). Only
--     the ticket/team/tip per-event flows consult payout_group_id, in app code.
-- ============================================================================

-- ---- 1. group_stripe_accounts (the club's Connect payout account) ----------
create table public.group_stripe_accounts (
  group_id          uuid primary key references public.groups(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled   boolean not null default false,
  payouts_enabled   boolean not null default false,
  details_submitted boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.group_stripe_accounts is
  'A group''s own Stripe Connect (Express) payout account (ADR 0038 Club tier). Group-hosted events with events.payout_group_id set route their destination charge here.';

create or replace function public.touch_group_stripe_accounts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_group_stripe_accounts_touch
  before update on public.group_stripe_accounts
  for each row execute function public.touch_group_stripe_accounts_updated_at();

alter table public.group_stripe_accounts enable row level security;

-- Owners/admins of the group can read its payout-account status (management
-- page). Writes happen only on the admin client (onboarding + webhook).
create policy group_stripe_accounts_select_manager
  on public.group_stripe_accounts for select
  using (
    exists (
      select 1 from public.group_members gm
       where gm.group_id = group_stripe_accounts.group_id
         and gm.user_id = auth.uid()
         and gm.role in ('owner', 'admin')
    )
  );

-- ---- 2. group_subscriptions (the Club subscription) ------------------------
create table public.group_subscriptions (
  group_id               uuid primary key references public.groups(id) on delete cascade,
  stripe_customer_id     text not null,
  stripe_subscription_id text,
  status                 text not null default 'incomplete'
    check (status in (
      'trialing','active','past_due','canceled','unpaid',
      'incomplete','incomplete_expired','paused'
    )),
  current_period_end     timestamptz,
  trial_end              timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index group_subscriptions_customer_idx
  on public.group_subscriptions (stripe_customer_id);
create unique index group_subscriptions_subscription_idx
  on public.group_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on table public.group_subscriptions is
  'A group''s Club subscription, mirrored from Stripe Billing by the customer.subscription.* webhook (metadata.kind = club). Gates the group payout account (ADR 0038).';

create or replace function public.touch_group_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_group_subscriptions_touch
  before update on public.group_subscriptions
  for each row execute function public.touch_group_subscriptions_updated_at();

alter table public.group_subscriptions enable row level security;

create policy group_subscriptions_select_manager
  on public.group_subscriptions for select
  using (
    exists (
      select 1 from public.group_members gm
       where gm.group_id = group_subscriptions.group_id
         and gm.user_id = auth.uid()
         and gm.role in ('owner', 'admin')
    )
  );

-- ---- 3. events.payout_group_id (the opt-in payout destination) -------------
alter table public.events
  add column payout_group_id uuid references public.groups(id) on delete set null;

comment on column public.events.payout_group_id is
  'Opt-in: route this event''s ticket/team/tip payouts to this group''s Connect account instead of host_id (ADR 0038). NULL = pay out to host_id (the default, and every pre-existing event). Set only while the price is unlocked (no paid registration yet).';

-- ---- 4. is_club_group -------------------------------------------------------
-- True while the group's Club subscription is live. Same 30-day past_due grace
-- as is_pro_host (monetization M-2) so an abandoned past_due club can't keep the
-- perk forever if dunning is misconfigured.
create or replace function public.is_club_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.group_subscriptions
     where group_id = p_group_id
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

grant execute on function public.is_club_group(uuid) to anon, authenticated;
