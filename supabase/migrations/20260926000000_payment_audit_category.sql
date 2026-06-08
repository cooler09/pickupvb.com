-- ============================================================================
-- event_payment_audit.category — classify ledger rows by revenue kind, and
-- backfill the kinds that were never recorded (tips + team entry fees).
-- See docs/audits/receipts-tax.md R-1.
--
-- Context: every receipts/earnings/annual-statement surface reads ONLY from
-- event_payment_audit, but until now only individual-attendee ticket payments
-- (and their refunds) were ever written to it. Tip payments and team entry
-- fees (ad-hoc + roster, both stored in event_team_payments) never produced an
-- audit row, so they were invisible to buyer receipts AND host earnings — a
-- tournament host whose revenue is team fees saw an empty earnings page and an
-- empty "good for taxes" CSV. The app layer now writes audit rows for the tip
-- and team checkout/refund paths; this migration adds the column they need and
-- backfills the historical rows so existing statements aren't blank.
--
-- Impact:
--   * New NOT NULL column `category` with default 'ticket'. Existing rows are
--     all attendee tickets, so the default backfills them correctly. Legacy
--     raw inserts that omit `category` (the cash mark-paid action and the
--     synchronous ticket-refund) continue to work — they land as 'ticket',
--     which is what they are.
--   * Host-earnings reads now filter `category in ('ticket','tip','team')`;
--     'sponsor_slot'/'badge_slot' are allowed by the CHECK for forward-compat
--     but are NOT recorded yet and are intentionally excluded from earnings
--     (platform revenue / host add-ons, not host payout income).
--   * Backfill is additive and idempotent (guarded by `not exists` on the
--     payment_intent_id), so a re-run inserts nothing.
-- ============================================================================

alter table public.event_payment_audit
  add column category text not null default 'ticket'
    check (category in ('ticket', 'tip', 'team', 'sponsor_slot', 'badge_slot'));

-- Index the income reads (host earnings + buyer receipts both filter/scan by
-- category alongside the existing event/occurred_at access paths).
create index if not exists event_payment_audit_category_idx
  on public.event_payment_audit (category);

-- ---- Backfill: tips ---------------------------------------------------------
-- Paid tips → a 'paid' row stamped at paid_at; refunded tips additionally get a
-- 'refunded' row at refunded_at so the tip nets out. Paid/refunded tips always
-- carry a Stripe payment intent (set at checkout completion), so we key the
-- idempotency guard on it.
insert into public.event_payment_audit
  (event_id, user_id, action, amount_cents, payment_intent_id, occurred_at, category)
select
  t.event_id,
  t.tipper_user_id,
  'paid',
  t.amount_cents,
  t.stripe_payment_intent_id,
  coalesce(t.paid_at, t.created_at),
  'tip'
from public.event_tips t
where t.status in ('paid', 'refunded')
  and t.paid_at is not null
  and t.stripe_payment_intent_id is not null
  and not exists (
    select 1 from public.event_payment_audit a
     where a.category = 'tip'
       and a.action = 'paid'
       and a.payment_intent_id = t.stripe_payment_intent_id
  );

insert into public.event_payment_audit
  (event_id, user_id, action, amount_cents, payment_intent_id, occurred_at, category)
select
  t.event_id,
  t.tipper_user_id,
  'refunded',
  t.amount_cents,
  t.stripe_payment_intent_id,
  coalesce(t.refunded_at, t.paid_at, t.created_at),
  'tip'
from public.event_tips t
where t.status = 'refunded'
  and t.stripe_payment_intent_id is not null
  and not exists (
    select 1 from public.event_payment_audit a
     where a.category = 'tip'
       and a.action = 'refunded'
       and a.payment_intent_id = t.stripe_payment_intent_id
  );

-- ---- Backfill: team entry fees (ad-hoc + roster) ----------------------------
-- event_team_payments is the unified payment row for both team-registration
-- aggregates, keyed by entry_id → event_team_entries → event_divisions(event_id).
-- It has no refunded_at column, so a refunded entry's refund row is stamped at
-- updated_at (best available approximation for historical rows).
insert into public.event_payment_audit
  (event_id, user_id, action, amount_cents, payment_intent_id, occurred_at, category)
select
  d.event_id,
  p.captain_id,
  'paid',
  coalesce(p.amount_paid_cents, 0),
  p.payment_intent_id,
  coalesce(p.paid_at, p.created_at),
  'team'
from public.event_team_payments p
  join public.event_team_entries e on e.id = p.entry_id
  join public.event_divisions d on d.id = e.division_id
where p.payment_status in ('paid', 'refunded')
  and p.paid_at is not null
  and p.payment_intent_id is not null
  and not exists (
    select 1 from public.event_payment_audit a
     where a.category = 'team'
       and a.action = 'paid'
       and a.payment_intent_id = p.payment_intent_id
  );

insert into public.event_payment_audit
  (event_id, user_id, action, amount_cents, payment_intent_id, occurred_at, category)
select
  d.event_id,
  p.captain_id,
  'refunded',
  coalesce(p.amount_paid_cents, 0),
  p.payment_intent_id,
  coalesce(p.updated_at, p.paid_at, p.created_at),
  'team'
from public.event_team_payments p
  join public.event_team_entries e on e.id = p.entry_id
  join public.event_divisions d on d.id = e.division_id
where p.payment_status = 'refunded'
  and p.payment_intent_id is not null
  and not exists (
    select 1 from public.event_payment_audit a
     where a.category = 'team'
       and a.action = 'refunded'
       and a.payment_intent_id = p.payment_intent_id
  );
