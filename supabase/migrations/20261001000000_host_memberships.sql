-- ============================================================================
-- Recurring host memberships — Phase 2 of season passes (ADR 0037 addendum).
-- See docs/adr/0037-season-passes.md § "Phase 2: recurring memberships".
--
-- Context: the one-shot credit pack (20260930000000_season_passes.sql) has a
-- recurring sibling — a monthly membership to a host. While a member's
-- subscription is active they claim a FREE spot on any of that host's
-- `accepts_pass_credits` open-play events (unlimited, no credit ledger). Selling
-- memberships is Pro-only (enforced in the app, like passes); the per-event
-- opt-in reuses the existing `events.accepts_pass_credits` flag.
--
-- Impact:
--   * New `host_membership_plans` (the product) — public read of active rows,
--     host owns writes. Pro-gating is in the app action (hasProBenefits).
--   * New `host_memberships` (a member's subscription state mirrored from Stripe
--     via the customer.subscription.* webhook). Reads are member-or-host; writes
--     are admin-only — same posture as host_subscriptions. Billing is a Connect
--     destination subscription (platform = merchant of record), so the platform
--     account receives the subscription webhooks.
--   * New `event_participant_payments.membership_id` marks a member-claimed spot.
--     Unlike pass redemptions there's no credit to return on leave, so no
--     decrement trigger — the participant just deletes.
--   * New `is_active_member(user, host)` — status check with the same 30-day
--     past_due period-end backstop as is_pro_host (monetization M-2).
--   * New `claim_membership_spot(event)` SECURITY DEFINER RPC: verifies an active
--     membership for the event's host, then reserves the participant row (the
--     capacity trigger fires → raises 'full') + a paid, zero-amount payment row
--     stamped with membership_id. Explicit auth.uid() gate (AGENTS pattern #8) —
--     it writes a `paid` payment row the pending-only self-write RLS forbids.
-- ============================================================================

-- ---- 1. host_membership_plans (the product a Pro host sells) ---------------
create table public.host_membership_plans (
  id           uuid primary key default uuid_generate_v4(),
  host_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 80),
  description  text check (description is null or length(description) <= 280),
  -- Monthly price. (v1 is monthly-only — annual is a deferred follow-up.)
  price_cents  int not null check (price_cents between 100 and 1000000),
  status       text not null default 'active' check (status in ('active', 'archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index host_membership_plans_host_idx on public.host_membership_plans (host_id, status);

comment on table public.host_membership_plans is
  'Pro-host recurring membership products (ADR 0037 Phase 2). An active member claims free spots on the host''s accepts_pass_credits open-play events.';

create or replace function public.touch_host_membership_plans_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_host_membership_plans_touch
  before update on public.host_membership_plans
  for each row execute function public.touch_host_membership_plans_updated_at();

alter table public.host_membership_plans enable row level security;

create policy host_membership_plans_select_public
  on public.host_membership_plans for select
  using (status = 'active' or auth.uid() = host_id);

create policy host_membership_plans_insert_own
  on public.host_membership_plans for insert
  with check (auth.uid() = host_id);

create policy host_membership_plans_update_own
  on public.host_membership_plans for update
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create policy host_membership_plans_delete_own
  on public.host_membership_plans for delete
  using (auth.uid() = host_id);

-- ---- 2. host_memberships (a member's subscription state) -------------------
create table public.host_memberships (
  id                     uuid primary key default uuid_generate_v4(),
  plan_id                uuid not null references public.host_membership_plans(id) on delete restrict,
  host_id                uuid not null references public.profiles(id) on delete cascade,
  member_user_id         uuid not null references public.profiles(id) on delete cascade,
  title_snapshot         text not null,
  stripe_customer_id     text,
  stripe_subscription_id text,
  -- Mirrors Stripe subscription statuses, like host_subscriptions.
  status                 text not null default 'incomplete'
                           check (status in (
                             'trialing','active','past_due','canceled','unpaid',
                             'incomplete','incomplete_expired','paused'
                           )),
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index host_memberships_member_idx on public.host_memberships (member_user_id, status);
create index host_memberships_host_idx on public.host_memberships (host_id, status);
create unique index host_memberships_subscription_idx
  on public.host_memberships (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on table public.host_memberships is
  'A member''s subscription to a host_membership_plan (ADR 0037 Phase 2). Mirrored from Stripe by the customer.subscription.* webhook; writes are admin-only.';

alter table public.host_memberships enable row level security;

-- Reads: the member sees their own memberships; the host sees their members.
-- Writes happen only on the admin (service-role) client from the webhook.
create policy host_memberships_select_member
  on public.host_memberships for select
  using (auth.uid() = member_user_id);

create policy host_memberships_select_host
  on public.host_memberships for select
  using (auth.uid() = host_id);

-- ---- 3. event_participant_payments.membership_id ---------------------------
-- Marks a participant row as a member-claimed spot (amount 0, paid). set null on
-- membership delete: keep the attendance row, just unlink.
alter table public.event_participant_payments
  add column membership_id uuid references public.host_memberships(id) on delete set null;

create index event_participant_payments_membership_idx
  on public.event_participant_payments (membership_id)
  where membership_id is not null;

-- ---- 4. is_active_member ----------------------------------------------------
-- True when the user holds an active membership to the host. trialing/active
-- always count; past_due counts only within a 30-day grace past current_period_end
-- (same backstop as is_pro_host — monetization M-2 — so an abandoned past_due
-- subscription can't grant access forever if dunning is misconfigured).
create or replace function public.is_active_member(p_user_id uuid, p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.host_memberships
     where member_user_id = p_user_id
       and host_id = p_host_id
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

grant execute on function public.is_active_member(uuid, uuid) to anon, authenticated;

-- ---- 5. claim_membership_spot RPC ------------------------------------------
-- SECURITY DEFINER with an explicit owner gate (AGENTS pattern #8): writes a
-- `paid` event_participant_payments row the pending-only self-write RLS forbids.
create or replace function public.claim_membership_spot(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_event        public.events%rowtype;
  v_membership_id uuid;
  v_division_id  uuid;
  v_participant_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found';
  end if;
  if v_event.type <> 'open_play' then
    raise exception 'event_not_open_play';
  end if;
  if v_event.accepts_pass_credits is not true then
    raise exception 'event_not_pass_eligible';
  end if;

  -- Resolve (and lock) the member's active membership to this host.
  select id into v_membership_id
    from public.host_memberships
   where member_user_id = v_uid
     and host_id = v_event.host_id
     and (
       status in ('trialing', 'active')
       or (status = 'past_due'
           and current_period_end is not null
           and current_period_end > now() - interval '30 days')
     )
   order by created_at desc
   limit 1
   for update;
  if v_membership_id is null then
    raise exception 'not_a_member';
  end if;

  select id into v_division_id
    from public.event_divisions
   where event_id = p_event_id
   order by sort_order asc
   limit 1;
  if v_division_id is null then
    raise exception 'no_division';
  end if;

  if exists (
    select 1 from public.event_participants
     where division_id = v_division_id and user_id = v_uid and role = 'attendee'
  ) then
    raise exception 'already_joined';
  end if;

  -- Reserve the spot. The capacity trigger fires and raises 'full' if full,
  -- which propagates out and rolls the transaction back.
  insert into public.event_participants (division_id, user_id, role)
  values (v_division_id, v_uid, 'attendee')
  returning id into v_participant_id;

  insert into public.event_participant_payments
    (participant_id, payment_status, amount_paid_cents, paid_at, membership_id)
  values (v_participant_id, 'paid', 0, now(), v_membership_id);

  return v_participant_id;
end;
$$;

grant execute on function public.claim_membership_spot(uuid) to authenticated;
