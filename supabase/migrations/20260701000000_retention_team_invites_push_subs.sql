-- ============================================================================
-- Retention purge — stale team invites + inactive push subscriptions.
-- See docs/audits/data-lifecycle.md (P3 #4, P3 #5).
--
-- Context: extends the pg_cron retention pipeline shipped in
-- 20260627000000_retention_cron_jobs.sql to two tables that still grow
-- unbounded.
--
-- 1. Pending team invites live as rows in `team_members` with
--    status='pending' and an `invited_at` timestamp
--    (20260514000000_team_member_invites.sql). The audit's §1 row labelled
--    "team_member_invites" was a doc error — there is no separate table.
--    Captain can re-invite anytime, so 30 days is plenty.
--
-- 2. Web push subscriptions are dropped HARD on 410/404 delivery responses
--    (see the delivery worker), but a subscription whose device went silent
--    without ever returning an error never gets cleaned up. Use
--    coalesce(last_used_at, created_at) so freshly-created subs aren't
--    purged before the worker has had a chance to send to them.
--
-- Impact: additive (two cron rows). No schema changes. First scheduled
-- run will purge anything already past its window. Re-running
-- cron.schedule with the same job name is idempotent (pg_cron upserts
-- by jobname).
-- ============================================================================

create extension if not exists pg_cron;

-- ---- P3 #4: team_members pending-invite TTL -------------------------------
-- 30-day cap on un-accepted captain invitations. Captain can re-invite.

select cron.schedule(
  'team_members_purge_pending_30d',
  '0 6 * * *',
  $$ delete from public.team_members
     where status = 'pending'
       and coalesce(invited_at, joined_at) < now() - interval '30 days' $$
);

-- ---- P3 #5: push_subscriptions inactive purge -----------------------------
-- 90-day cap on subscriptions whose last successful send (or creation, if
-- never used) is older than the window. The delivery worker already
-- HARD-deletes on 410/404; this catches silent-death endpoints.

select cron.schedule(
  'push_subscriptions_purge_inactive_90d',
  '15 6 * * *',
  $$ delete from public.push_subscriptions
     where coalesce(last_used_at, created_at) < now() - interval '90 days' $$
);
