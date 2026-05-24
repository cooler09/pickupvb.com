-- Defense-in-depth RLS for user-driven writes on event_attendees / event_tips /
-- event_payment_audit. Previously the server actions for ticket checkout,
-- tipping, and host-toggled "mark as paid" all reached for the admin client,
-- which bypasses RLS entirely. Audit P2 #4 (docs/audits/security.md) flagged
-- this: a single regressed app-layer guard would let one user write rows
-- "as" another.
--
-- Policies added:
--   * event_attendees_update_own_pending — caller can update their own row
--     iff it's currently 'pending' AND stays 'pending' (this allows the
--     checkout flow to stash checkout_session_id without letting a user
--     self-promote to 'paid').
--   * event_attendees_update_host — host / co-host (via is_event_host) can
--     update any attendee row on their event (used for the manual
--     mark-as-paid / mark-as-unpaid flow).
--   * event_tips_select_own — tipper can read their own row (needed for
--     .insert().select() round-trip on the pending insert).
--   * event_tips_insert_own — tipper inserts their own pending row.
--   * event_tips_update_own_pending — tipper updates own pending row,
--     staying pending (mirrors event_attendees).
--   * event_tips_delete_own_pending — tipper deletes own pending row on
--     checkout-session-create failure (rollback).
--   * event_payment_audit_insert_host — host / co-host writes audit rows
--     for events they host.
--
-- The webhook handlers continue to use the admin client (correct — they
-- run with no user session and need to flip rows to 'paid' / 'refunded').

-- ---- event_attendees ------------------------------------------------------

create policy event_attendees_update_own_pending
  on public.event_attendees
  for update
  using (auth.uid() = user_id and payment_status = 'pending')
  with check (auth.uid() = user_id and payment_status = 'pending');

create policy event_attendees_update_host
  on public.event_attendees
  for update
  using (public.is_event_host(event_id))
  with check (public.is_event_host(event_id));

-- ---- event_tips ----------------------------------------------------------

create policy event_tips_select_own
  on public.event_tips
  for select
  using (auth.uid() = tipper_user_id);

create policy event_tips_insert_own
  on public.event_tips
  for insert
  with check (
    auth.uid() = tipper_user_id
    and status = 'pending'
    and amount_cents > 0
  );

create policy event_tips_update_own_pending
  on public.event_tips
  for update
  using (auth.uid() = tipper_user_id and status = 'pending')
  with check (auth.uid() = tipper_user_id and status = 'pending');

create policy event_tips_delete_own_pending
  on public.event_tips
  for delete
  using (auth.uid() = tipper_user_id and status = 'pending');

-- ---- event_payment_audit -------------------------------------------------

create policy event_payment_audit_insert_host
  on public.event_payment_audit
  for insert
  with check (public.is_event_host(event_id));
