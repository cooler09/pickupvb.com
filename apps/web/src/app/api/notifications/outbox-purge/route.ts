/**
 * Daily maintenance cron — two PII retention tasks (PII audit P2 #5 + #8):
 *
 * 1. Outbox purge: deletes terminal notification_outbox rows.
 *    sent / skipped — 30 days  (enough for dispute lookups)
 *    failed         — 90 days  (enough for retry / incident investigation)
 *
 * 2. Report purge: deletes community_listing_reports AND media_post_reports rows
 *    older than 180 days. The reporter user_id + reason have no moderation value
 *    past the initial review window (privacy audit P2 #8 + #19).
 *
 * Schedule: once daily at 04:00 UTC (see vercel.json).
 */
import { NextResponse } from 'next/server';
import { SupabaseNotificationOutboxRepository } from '@pickupvb/infrastructure';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function authorized(request: Request): Promise<boolean> {
  const secret = process.env['CRON_SECRET'];
  if (!secret) return true;
  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const outbox = new SupabaseNotificationOutboxRepository(admin);
  const now = new Date();

  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // The notification_outbox purges go through the drain port; the report
    // purges belong to their own subdomains (not the notification port) and stay
    // direct admin deletes.
    const [purgedTerminal, purgedFailed, { count: purgedReports }, { count: purgedMediaReports }] =
      await Promise.all([
        outbox.purgeTerminal(cutoff30),
        outbox.purgeFailed(cutoff90),
        admin
          .from('community_listing_reports')
          .delete({ count: 'exact' })
          .lt('created_at', cutoff180),
        admin.from('media_post_reports').delete({ count: 'exact' }).lt('created_at', cutoff180),
      ]);

    return NextResponse.json({
      ok: true,
      purged: {
        outbox_terminal: purgedTerminal,
        outbox_failed: purgedFailed,
        listing_reports: purgedReports ?? 0,
        media_reports: purgedMediaReports ?? 0,
      },
    });
  } catch (err) {
    await log.error('[outbox-purge-cron] failed', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
