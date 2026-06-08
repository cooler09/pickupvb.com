-- ============================================================================
-- event_payment_audit: drop the dead 'failed' action value.
-- See docs/audits/receipts-tax.md R-8.
--
-- Context: the ledger's CHECK allowed action in ('paid','refunded','failed'),
-- but nothing ever wrote a 'failed' row — `payment_intent.payment_failed` is an
-- intentional no-op (stripe-integration audit SI-1), checkout writes 'paid',
-- refunds write 'refunded'. The domain `PaymentAuditEntry.action` type is
-- already `'paid' | 'refunded'`. The app's four reader queries carried a
-- defensive `.neq('action','failed')` filter against rows that can't exist;
-- those filters were removed, so this tightens the constraint to enforce the
-- real invariant at the DB level (belt-and-suspenders now that the app no
-- longer filters).
--
-- Impact: constraint-only change. The defensive delete reclaims any stray
-- 'failed' row (there should be none — they were never written and surface in
-- no UI) so the new CHECK can be added. No column or RLS changes.
-- ============================================================================

delete from public.event_payment_audit where action = 'failed';

alter table public.event_payment_audit
  drop constraint if exists event_payment_audit_action_check;

alter table public.event_payment_audit
  add constraint event_payment_audit_action_check
  check (action in ('paid', 'refunded'));
