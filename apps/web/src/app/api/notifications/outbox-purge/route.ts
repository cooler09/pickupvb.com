/**
 * Daily maintenance cron — PII retention tasks (PII audit P2 #5 + #8 + #19 + #22):
 *
 * 1. Outbox purge: deletes terminal notification_outbox rows.
 *    sent / skipped — 30 days  (enough for dispute lookups)
 *    failed         — 90 days  (enough for retry / incident investigation)
 *
 * 2. Report purge: deletes community_listing_reports AND media_post_reports rows
 *    older than 180 days. The reporter user_id + reason have no moderation value
 *    past the initial review window (privacy audit P2 #8 + #19).
 *
 * 3. Audit-trail purge: deletes audit_log rows older than 365 days — the
 *    security trail (group-role / co-host / Stripe-mirror changes) has served its
 *    incident-investigation window by then (privacy #22 / security P3 #8). The
 *    actor/target FKs already SET NULL on account deletion, so this is pure TTL.
 *
 * 4. Suppression re-validation: deletes email_suppressions rows whose reason is a
 *    hard `bounced` older than 365 days, so a fixed/recycled mailbox can recover.
 *    Self-healing — a still-dead address re-suppresses on its next send. Spam
 *    `complained` rows are kept indefinitely (an explicit do-not-mail signal).
 *    Bounds the indefinite retention of a raw address flagged in privacy #22;
 *    per-account deletion also clears the address (see lib/account-purge.ts).
 *
 * Schedule: once daily at 04:00 UTC (see vercel.json).
 */
import { NextResponse } from 'next/server';
import { SupabaseNotificationOutboxRepository } from '@pickupvb/infrastructure';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { log } from '@/lib/log';
import { isCronAuthorized } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const outbox = new SupabaseNotificationOutboxRepository(admin);
  const now = new Date();

  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff365 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // The notification_outbox purges go through the drain port; the report /
    // audit / suppression purges belong to their own subdomains (not the
    // notification port) and stay direct admin deletes (service-role only).
    const [
      purgedTerminal,
      purgedFailed,
      { count: purgedReports },
      { count: purgedMediaReports },
      { count: purgedAuditLog },
      { count: purgedSuppressions },
    ] = await Promise.all([
      outbox.purgeTerminal(cutoff30),
      outbox.purgeFailed(cutoff90),
      admin
        .from('community_listing_reports')
        .delete({ count: 'exact' })
        .lt('created_at', cutoff180),
      admin.from('media_post_reports').delete({ count: 'exact' }).lt('created_at', cutoff180),
      admin.from('audit_log').delete({ count: 'exact' }).lt('occurred_at', cutoff365),
      admin
        .from('email_suppressions')
        .delete({ count: 'exact' })
        .eq('reason', 'bounced')
        .lt('last_event_at', cutoff365),
    ]);

    return NextResponse.json({
      ok: true,
      purged: {
        outbox_terminal: purgedTerminal,
        outbox_failed: purgedFailed,
        listing_reports: purgedReports ?? 0,
        media_reports: purgedMediaReports ?? 0,
        audit_log: purgedAuditLog ?? 0,
        email_suppressions_bounced: purgedSuppressions ?? 0,
      },
    });
  } catch (err) {
    await log.error('[outbox-purge-cron] failed', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
