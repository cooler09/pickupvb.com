-- Allow authenticated users to read their own payment audit history.
-- Powers the buyer-facing /profile/receipts page (tax records).
-- Service-role inserts (from the Stripe webhook + refund flow) are unaffected.
create policy event_payment_audit_select_own
  on public.event_payment_audit
  for select
  using (user_id = auth.uid());
