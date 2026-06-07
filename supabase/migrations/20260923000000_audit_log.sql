-- ============================================================================
-- Generic audit_log for security-relevant administrative actions — security
-- audit P3 #8. Extends the refund-only event_payment_audit to the wider set the
-- audit flagged: group member add/remove/role changes, event co-host add/remove
-- (a privilege-escalation surface — see P1 #12), Stripe Connect account mirrors,
-- and host-subscription state changes.
--
-- Context: event_payment_audit (20260516000000) records ticket paid/refunded/
-- failed, but nothing captured who changed a group member's role, who added or
-- removed an event co-host, or the Stripe account / subscription transitions the
-- webhooks mirror. This adds one append-only table those write paths log into so
-- a privilege change or payout-account change has a durable trail.
--
-- Impact: additive. New table public.audit_log. RLS-on with NO policies — the
-- service-role admin client is the only writer + reader (matches
-- event_payment_audit; an audit trail users could write or edit would be
-- worthless). `entity_id` is text (not uuid) because it holds both our uuids
-- (group / event ids) and Stripe ids (acct_…, sub_…). The actor/target FKs use
-- ON DELETE SET NULL so an account-deletion purge (ADR 0029) preserves the trail
-- with the user nulled rather than cascading the row away. App writes are
-- fail-quiet (lib/audit-log.ts) — an audit failure must never block the action
-- it records. Generated types were hand-edited to add this table ahead of the
-- next gen:types run.
-- ============================================================================

create table public.audit_log (
  id             uuid primary key default uuid_generate_v4(),
  occurred_at    timestamptz not null default now(),
  action         text not null,
  entity_type    text not null,
  entity_id      text not null,
  actor_user_id  uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  metadata       jsonb not null default '{}'::jsonb
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, occurred_at desc);
create index audit_log_actor_idx  on public.audit_log (actor_user_id, occurred_at desc);

alter table public.audit_log enable row level security;
-- No policies: the service-role admin client is the only writer and reader. An
-- append-only administrative trail with no user-facing access (mirrors
-- event_payment_audit). A future retention cron can prune rows older than N days.
