-- ============================================================================
-- event_payment_audit.off_platform — flag rows the host recorded as paid
-- out-of-band (cash / Venmo), so receipts + earnings can treat them correctly.
-- See docs/audits/receipts-tax.md R-5 / R-6.
--
-- Context: when a host marks an attendee paid in cash
-- (events/[id]/manage-payments-actions.ts) we write an audit row with a NULL
-- payment_intent_id — no money flowed through Stripe. Two bugs followed:
--   * R-5: the earnings page applied the platform-fee estimate to these rows,
--     deducting a fee that was never charged (PickupVB takes nothing on cash).
--   * R-6: a cash paid + later "mark unpaid" (refund) landed under two distinct
--     synthetic `audit:<row-id>` group keys, so they showed as two rows instead
--     of one net-$0 transaction.
-- An explicit flag (rather than inferring from a NULL payment_intent_id) lets
-- the app exclude these rows from the fee math and group a cash paid/refund
-- pair by (event_id, user_id) so they net.
--
-- Impact: additive boolean column, default false (every existing on-platform
-- row is correct as-is). Backfill flips existing NULL-payment_intent rows to
-- true — those are the historical cash rows. The cash write path now sets it
-- explicitly. No RLS / constraint changes.
-- ============================================================================

alter table public.event_payment_audit
  add column off_platform boolean not null default false;

-- Existing NULL-payment_intent rows are host-recorded cash payments.
update public.event_payment_audit
   set off_platform = true
 where payment_intent_id is null;
