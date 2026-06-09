-- ============================================================================
-- Email suppression list — bounce / complaint sink for the notification outbox.
-- See docs/audits/notifications-messaging.md P2 #3.
--
-- Context: the Resend email adapter (apps/web/src/lib/email-resend.ts) flagged
-- hard-bounce handling as TBD — there was no Resend webhook and no suppression
-- list, so a dead or complaining address was retried and re-sent on every future
-- notification. Repeatedly mailing a hard-bounced address (or one that hit "spam")
-- degrades sender reputation and can get the domain throttled/blocked. This adds
-- the sink the new `/api/webhooks/resend` route writes to and the outbox worker
-- reads before each email send.
--
-- Impact: additive. One new service-role-only table (`email_suppressions`,
-- keyed on the lowercased address). No changes to existing tables / RLS / RPCs.
-- The worker skips an email row whose `to_address` is present here
-- (status -> 'skipped', reason 'email-suppressed'); the webhook upserts a row on
-- `email.bounced` (Permanent) / `email.complained`. Both run on the service-role
-- client (session-less), so no client-facing RLS policy is needed. Generated
-- types were hand-edited to add this table (per AGENTS.md migration convention)
-- and will be regenerated against the deployed schema on the next gen:types.
-- ============================================================================

create table public.email_suppressions (
  -- Lowercased recipient address. The app normalizes on read + write so the
  -- membership test is case-insensitive (the local part technically isn't, but
  -- in practice mailbox providers treat it so, and a hard bounce is per-mailbox).
  address             text primary key,
  -- Why the address was suppressed. 'bounced' = permanent (hard) bounce;
  -- 'complained' = recipient marked the mail as spam. Transient/soft bounces are
  -- NOT recorded (they're temporary — the outbox retry/backoff handles them).
  reason              text not null check (reason in ('bounced', 'complained')),
  -- The Resend message id from the most recent event, for incident tracing.
  provider_message_id text,
  -- Bumped each time another bounce/complaint lands for the same address.
  last_event_at       timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;
-- No policies: service-role only (the webhook writer + worker reader both run on
-- the admin client; suppression is platform infrastructure, not user data).
