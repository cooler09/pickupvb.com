-- Allow hosts to read payment-audit rows for events they host. This powers
-- the host earnings page (/profile/billing/earnings) without needing the
-- admin client. Buyers already have a `_select_own` policy from the
-- 20260521 migration; the two policies compose with OR.

create policy event_payment_audit_select_host
  on public.event_payment_audit
  for select
  using (
    exists (
      select 1
        from public.events e
       where e.id = event_payment_audit.event_id
         and e.host_id = auth.uid()
    )
  );
