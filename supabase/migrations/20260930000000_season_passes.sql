-- ============================================================================
-- Season passes / multi-session punch cards (ADR 0037).
-- See docs/adr/0037-season-passes.md
--
-- Context: monetization audit O-1 — a host-priced prepaid credit pack
-- ("10-session open-play pass") that an attendee buys once and redeems per
-- session. Wins for the attendee (cheaper, one payment), the host (committed
-- up-front cash, less weekly payment admin), and the platform (normal ticket
-- take-rate on a larger transaction). Selling passes is a Pro-only host
-- capability (net-new, no clawback — ADR 0014); buying needs no Pro. A pass
-- purchase is a destination charge to events.host_id's Connect account, exactly
-- like a ticket. Redemption reserves an `event_participants` spot with a prepaid
-- credit (no Stripe charge) on any of that host's open-play events the host has
-- flagged `accepts_pass_credits`.
--
-- Impact:
--   * New `host_passes` (the product) — public read of active rows so buyers can
--     browse a host's offerings; host owns writes. Pro-gating is enforced in the
--     app action (hasProBenefits), not RLS, mirroring the sponsor/badge slots.
--   * New `pass_purchases` (a buyer's credit balance). Writes are admin-only
--     (the purchase action inserts the pending row; the Stripe webhook flips it
--     to paid and stamps expires_at), reads are buyer-or-host — same posture as
--     host_subscriptions.
--   * New `event_participant_payments.pass_purchase_id` marks a participant row
--     as redeemed against a purchase. credits_used = count of these per
--     purchase; participant-delete cascade returns the credit (the cancel path).
--   * New `events.accepts_pass_credits` (host opt-in; open-play only in v1).
--   * New `redeem_pass_credit(purchase, event)` SECURITY DEFINER RPC: it must
--     write a `paid` payment row, which the pending-only self-write RLS policy
--     forbids, so a definer with an explicit `auth.uid() = buyer_user_id` gate is
--     correct (AGENTS pattern #8). Locks the purchase row, re-checks
--     eligibility/credits/expiry/not-already-joined, inserts the participant (the
--     capacity trigger still fires → raises 'full'), inserts the paid
--     zero-amount payment row. Single transaction → no overdraft, no orphan.
--   * v1 does NOT write pass purchases to event_payment_audit (that table's
--     event_id is NOT NULL and a pass isn't event-scoped); host pass revenue is
--     surfaced on the pass-management page. Ledger/CSV integration is a tracked
--     follow-up (ADR 0037 Decision #2).
-- ============================================================================

-- ---- 1. host_passes (the product a Pro host sells) -------------------------
create table public.host_passes (
  id              uuid primary key default uuid_generate_v4(),
  host_id         uuid not null references public.profiles(id) on delete cascade,
  title           text not null check (length(btrim(title)) between 1 and 80),
  description     text check (description is null or length(description) <= 280),
  credit_count    int not null check (credit_count between 1 and 100),
  price_cents     int not null check (price_cents between 100 and 1000000),
  -- null = credits never expire; else credits expire this many days after the
  -- purchase is paid.
  expires_in_days int check (expires_in_days is null or expires_in_days between 1 and 730),
  status          text not null default 'active' check (status in ('active', 'archived')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index host_passes_host_idx on public.host_passes (host_id, status);

comment on table public.host_passes is
  'Pro-host prepaid credit-pack products (ADR 0037). Buyers purchase a pass and redeem credits to attend open-play events the host flags accepts_pass_credits.';

create or replace function public.touch_host_passes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_host_passes_touch
  before update on public.host_passes
  for each row execute function public.touch_host_passes_updated_at();

alter table public.host_passes enable row level security;

-- Buyers browse a host's ACTIVE offerings; the host sees all their own
-- (active + archived).
create policy host_passes_select_public
  on public.host_passes for select
  using (status = 'active' or auth.uid() = host_id);

create policy host_passes_insert_own
  on public.host_passes for insert
  with check (auth.uid() = host_id);

create policy host_passes_update_own
  on public.host_passes for update
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

create policy host_passes_delete_own
  on public.host_passes for delete
  using (auth.uid() = host_id);

-- ---- 2. pass_purchases (a buyer's credit balance) --------------------------
create table public.pass_purchases (
  id                  uuid primary key default uuid_generate_v4(),
  -- restrict: a sold pass can't be hard-deleted (archive it instead).
  pass_id             uuid not null references public.host_passes(id) on delete restrict,
  -- snapshot of the payout owner (= host_passes.host_id, which is immutable).
  host_id             uuid not null references public.profiles(id) on delete cascade,
  buyer_user_id       uuid not null references public.profiles(id) on delete cascade,
  -- snapshot the title so a later rename/archive doesn't rewrite the buyer's
  -- receipt/balance label.
  title_snapshot      text not null,
  credits_total       int not null check (credits_total between 1 and 100),
  -- Maintained counter: bumped by redeem_pass_credit, decremented by the
  -- AFTER DELETE trigger on event_participant_payments when a redemption is
  -- released (cancel/leave). credits_remaining = credits_total - credits_used.
  -- A counter (vs. counting payment rows) lets the buyer + host read remaining
  -- straight off this row under the existing select policies.
  credits_used        int not null default 0 check (credits_used >= 0),
  price_cents         int not null check (price_cents >= 0),
  -- stamped at payment completion from the pass's expires_in_days; null = never.
  expires_at          timestamptz,
  payment_status      text not null default 'pending'
                        check (payment_status in ('pending', 'paid', 'refunded')),
  checkout_session_id text,
  payment_intent_id   text,
  amount_paid_cents   int,
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index pass_purchases_buyer_idx on public.pass_purchases (buyer_user_id, payment_status);
create index pass_purchases_host_idx on public.pass_purchases (host_id, payment_status);
create unique index pass_purchases_checkout_session_idx
  on public.pass_purchases (checkout_session_id)
  where checkout_session_id is not null;

comment on table public.pass_purchases is
  'A buyer''s purchased pass + remaining-credit balance (ADR 0037). Writes are admin/webhook only; reads are buyer-or-host.';

alter table public.pass_purchases enable row level security;

-- Reads: the buyer sees their own balances; the host sees who bought their
-- passes. No insert/update/delete policy → writes happen only on the admin
-- (service-role) client: the purchase action inserts the pending row, the
-- webhook flips it to paid. Same posture as host_subscriptions.
create policy pass_purchases_select_buyer
  on public.pass_purchases for select
  using (auth.uid() = buyer_user_id);

create policy pass_purchases_select_host
  on public.pass_purchases for select
  using (auth.uid() = host_id);

-- ---- 3. event_participant_payments.pass_purchase_id ------------------------
-- Marks a participant row as redeemed against a pass purchase (amount 0, paid).
-- set null on purchase delete: keep the attendance row, just unlink.
alter table public.event_participant_payments
  add column pass_purchase_id uuid references public.pass_purchases(id) on delete set null;

create index event_participant_payments_pass_purchase_idx
  on public.event_participant_payments (pass_purchase_id)
  where pass_purchase_id is not null;

-- Return a credit when a pass-redeemed participant is released. The leave/cancel
-- path deletes the event_participants row, which cascades to delete its payment
-- row; this AFTER DELETE trigger fires on that cascade and decrements the
-- purchase's credits_used (floored at 0 so the check constraint can't trip).
create or replace function public.return_pass_credit_on_payment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.pass_purchase_id is not null then
    update public.pass_purchases
       set credits_used = greatest(0, credits_used - 1)
     where id = old.pass_purchase_id;
  end if;
  return old;
end;
$$;

create trigger trg_return_pass_credit
  after delete on public.event_participant_payments
  for each row execute function public.return_pass_credit_on_payment_delete();

-- ---- 4. events.accepts_pass_credits (host opt-in) --------------------------
alter table public.events
  add column accepts_pass_credits boolean not null default false;

comment on column public.events.accepts_pass_credits is
  'Host opt-in: this open-play event accepts redemption of the host''s pass credits (ADR 0037).';

-- ---- 5. redeem_pass_credit RPC ---------------------------------------------
-- SECURITY DEFINER with an explicit owner gate (AGENTS pattern #8): the function
-- must write a `paid` event_participant_payments row, which the pending-only
-- self-write RLS policy forbids. The gate (auth.uid() = buyer_user_id) replaces
-- RLS; the capacity trigger on event_participants still fires (raises 'full').
create or replace function public.redeem_pass_credit(p_purchase_id uuid, p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_purchase     public.pass_purchases%rowtype;
  v_event        public.events%rowtype;
  v_division_id  uuid;
  v_participant_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Lock the purchase row so concurrent redemptions can't overdraw the balance.
  select * into v_purchase
    from public.pass_purchases
   where id = p_purchase_id
   for update;
  if not found or v_purchase.buyer_user_id <> v_uid then
    raise exception 'purchase_not_found';
  end if;
  if v_purchase.payment_status <> 'paid' then
    raise exception 'purchase_not_paid';
  end if;
  if v_purchase.expires_at is not null and v_purchase.expires_at <= now() then
    raise exception 'purchase_expired';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found';
  end if;
  if v_event.host_id <> v_purchase.host_id then
    raise exception 'event_host_mismatch';
  end if;
  if v_event.type <> 'open_play' then
    raise exception 'event_not_open_play';
  end if;
  if v_event.accepts_pass_credits is not true then
    raise exception 'event_not_pass_eligible';
  end if;

  -- Default (sort_order 0) division of the event.
  select id into v_division_id
    from public.event_divisions
   where event_id = p_event_id
   order by sort_order asc
   limit 1;
  if v_division_id is null then
    raise exception 'no_division';
  end if;

  -- Remaining credits read straight off the locked row.
  if v_purchase.credits_used >= v_purchase.credits_total then
    raise exception 'no_credits';
  end if;

  if exists (
    select 1 from public.event_participants
     where division_id = v_division_id and user_id = v_uid and role = 'attendee'
  ) then
    raise exception 'already_joined';
  end if;

  -- Reserve the spot. The capacity trigger fires and raises if the event is
  -- full; that propagates out of this function and rolls the transaction back.
  insert into public.event_participants (division_id, user_id, role)
  values (v_division_id, v_uid, 'attendee')
  returning id into v_participant_id;

  insert into public.event_participant_payments
    (participant_id, payment_status, amount_paid_cents, paid_at, pass_purchase_id)
  values (v_participant_id, 'paid', 0, now(), v_purchase.id);

  -- Consume the credit. The matching decrement lives in the AFTER DELETE
  -- trigger on event_participant_payments (cancel/leave returns the credit).
  update public.pass_purchases
     set credits_used = credits_used + 1
   where id = v_purchase.id;

  return v_participant_id;
end;
$$;

grant execute on function public.redeem_pass_credit(uuid, uuid) to authenticated;
