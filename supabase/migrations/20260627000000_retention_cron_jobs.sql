-- ============================================================================
-- Retention purge — pg_cron jobs for soft-deleted / append-only tables.
-- See docs/audits/data-lifecycle.md (P1 #1, P2 #3, P3 #3).
--
-- Context: today the repo has zero retention policy. `notification_outbox`
-- retains rendered email/SMS bodies + recipient `to_address` forever
-- (privacy.md P2 on the PII axis, data-lifecycle P1 on the scaling axis —
-- ~80–110 GB at 100k MAU over 2 years). `notifications` (in-app feed)
-- grows unbounded even though the bell never renders old items.
-- `marketing_attribution` keeps first-touch UTM rows forever though the
-- cohort signal is noise after ~2 years. This migration adds pg_cron jobs
-- that hard-delete past the retention window. One job per table so a single
-- bad query can't block the whole pipeline; staggered start times.
--
-- Impact: additive (extension + cron rows). No table schema changes, no
-- RLS changes. First scheduled run will purge anything already past its
-- window — the dev DB will see a one-time delete of any rows older than
-- the windows below. Production behaviour unchanged until rows age in.
-- Re-running cron.schedule with the same job name is idempotent
-- (pg_cron upserts by jobname).
-- ============================================================================

create extension if not exists pg_cron;

-- ---- P1 #1: notification_outbox — 90-day GDPR purge -----------------------
-- Rendered email/SMS bodies + recipient addresses. 90 days matches the
-- typical "send a follow-up about that thing" window without crossing the
-- data-minimization line on retained PII.

select cron.schedule(
  'notification_outbox_purge_sent_90d',
  '0 4 * * *',
  $$ delete from public.notification_outbox
     where sent_at is not null
       and sent_at < now() - interval '90 days' $$
);

-- Failed rows older than 30 days have given up (status='failed' is terminal);
-- purge them too. Retry logic lives in the delivery worker, not the table.
select cron.schedule(
  'notification_outbox_purge_failed_30d',
  '15 4 * * *',
  $$ delete from public.notification_outbox
     where status = 'failed'
       and created_at < now() - interval '30 days' $$
);

-- ---- P2 #3: notifications (in-app feed) -----------------------------------
-- Schema has `read_at` + an unread partial index, ready to drive TTL.
-- 30d read / 180d unread caps. If a user hasn't logged in for six months
-- the bell doesn't need to remember they got a reminder for an event that
-- already happened.

select cron.schedule(
  'notifications_purge_read_30d',
  '30 4 * * *',
  $$ delete from public.notifications
     where read_at is not null
       and read_at < now() - interval '30 days' $$
);

select cron.schedule(
  'notifications_purge_unread_180d',
  '45 4 * * *',
  $$ delete from public.notifications
     where read_at is null
       and created_at < now() - interval '180 days' $$
);

-- ---- P3 #3: marketing_attribution — 24-month cap --------------------------
-- First-touch UTM rows. After ~2y the cohort analyses get noisier than
-- the data adds value.

select cron.schedule(
  'marketing_attribution_purge_24mo',
  '0 5 * * *',
  $$ delete from public.marketing_attribution
     where captured_at < now() - interval '24 months' $$
);

-- ---- Note: hero_images orphan sweep (audit P3 #2) -------------------------
-- Deferred. Hero images are stored as URLs on events/groups/profiles
-- columns + objects in the `hero-images` storage bucket — there is no
-- `hero_images` table. Orphan cleanup needs to walk storage.objects and
-- parse `{user_id}/{entity_type}/{entity_id}/...` paths against live
-- entity ids. Tracked in docs/audits/hero-images.md and data-lifecycle.md
-- P3 #2; needs a separate edge-function or SQL helper that joins
-- storage.objects with the three parent tables.
