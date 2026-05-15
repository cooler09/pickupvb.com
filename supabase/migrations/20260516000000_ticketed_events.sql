-- ============================================================================
-- Ticketed events (Phase 2 of monetization)
-- ----------------------------------------------------------------------------
-- Adds price + payment-status columns to events / event_attendees /
-- event_guests so a host can charge for entry. A `price_cents` of 0 keeps the
-- event free with no Stripe involvement (status stays 'none').
--
-- Capacity model: a "pending" attendee row is inserted BEFORE the user is
-- redirected to Stripe Checkout. That reserves the spot via the existing
-- capacity trigger. The webhook later flips status to 'paid', or removes the
-- row if checkout expires / payment fails.
--
-- Refunds: tracked by setting payment_status='refunded' AND removing the row
-- (the row is what counts against capacity). We keep a record in
-- `event_payment_audit` so we can show "X refunds issued" to hosts later.
-- ============================================================================

-- ---- events: pricing config -----------------------------------------------
alter table public.events
  add column price_cents          integer not null default 0
    check (price_cents >= 0 and price_cents <= 1000000),  -- $0 - $10,000
  add column host_absorbs_fee     boolean not null default false,
  add column refund_window_hours  integer not null default 24
    check (refund_window_hours >= 0 and refund_window_hours <= 720);

-- A paid event MUST be hosted by someone with a connected Stripe account.
-- That cross-table guard is enforced in the application layer (publish/edit
-- actions check host_stripe_accounts.charges_enabled before allowing
-- price_cents > 0). We could also add a trigger, but app-layer keeps the
-- error model consistent (DomainError subclass with a useful message).

-- ---- payment status enum (text, not pg enum, for schema flexibility) ------
-- 'none'      = free event, or no payment expected
-- 'pending'   = checkout session created, awaiting completion
-- 'paid'      = payment captured
-- 'refunded'  = payment refunded (row should also be deleted to free capacity)

-- ---- event_attendees: authenticated paid signups --------------------------
alter table public.event_attendees
  add column payment_status        text not null default 'none'
    check (payment_status in ('none', 'pending', 'paid', 'refunded')),
  add column checkout_session_id   text,
  add column payment_intent_id     text,
  add column amount_paid_cents     integer not null default 0
    check (amount_paid_cents >= 0),
  add column paid_at               timestamptz;

create index event_attendees_payment_intent_idx
  on public.event_attendees (payment_intent_id)
  where payment_intent_id is not null;
create index event_attendees_session_idx
  on public.event_attendees (checkout_session_id)
  where checkout_session_id is not null;

-- ---- event_guests: anonymous paid signups ---------------------------------
alter table public.event_guests
  add column payment_status        text not null default 'none'
    check (payment_status in ('none', 'pending', 'paid', 'refunded')),
  add column checkout_session_id   text,
  add column payment_intent_id     text,
  add column amount_paid_cents     integer not null default 0
    check (amount_paid_cents >= 0),
  add column paid_at               timestamptz;

create index event_guests_payment_intent_idx
  on public.event_guests (payment_intent_id)
  where payment_intent_id is not null;
create index event_guests_session_idx
  on public.event_guests (checkout_session_id)
  where checkout_session_id is not null;

-- ---- Helper: count paid attendees on an event ------------------------------
-- Used by application layer to decide whether price/fee/refund-window can
-- still be edited (locks once first payment is captured).
create or replace function public.event_paid_attendee_count(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.event_attendees
       where event_id = p_event_id and payment_status = 'paid')::int
    +
    (select count(*) from public.event_guests
       where event_id = p_event_id and payment_status = 'paid')::int
$$;
grant execute on function public.event_paid_attendee_count(uuid) to anon, authenticated;

-- ---- Audit log for refunds (so we can show history without polling Stripe)
create table public.event_payment_audit (
  id              uuid primary key default uuid_generate_v4(),
  event_id        uuid not null references public.events(id) on delete cascade,
  -- Either user_id or guest_id is set, never both. (Validated by check.)
  user_id         uuid references public.profiles(id) on delete set null,
  guest_id        uuid references public.event_guests(id) on delete set null,
  action          text not null check (action in ('paid', 'refunded', 'failed')),
  amount_cents    integer not null check (amount_cents >= 0),
  payment_intent_id text,
  occurred_at     timestamptz not null default now(),
  constraint event_payment_audit_owner check (
    (user_id is not null)::int + (guest_id is not null)::int <= 1
  )
);

create index event_payment_audit_event_idx
  on public.event_payment_audit (event_id, occurred_at desc);

alter table public.event_payment_audit enable row level security;
-- No policies: service-role (webhook) writes; reads happen through views or
-- application-layer queries that use the admin client.
