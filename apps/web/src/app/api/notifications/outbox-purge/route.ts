/**
 * Daily maintenance cron — two PII retention tasks (PII audit P2 #5 + #8):
 *
 * 1. Outbox purge: deletes terminal notification_outbox rows.
 *    sent / skipped — 30 days  (enough for dispute lookups)
 *    failed         — 90 days  (enough for retry / incident investigation)
 *
 * 2. Listing report purge: deletes community_listing_reports rows older than
 *    180 days. The reporter user_id + freeform reason have no moderation
 *    value past the initial review window.
 *
 * Schedule: once daily at 04:00 UTC (see vercel.json).
 */
import { NextResponse } from 'next/server';
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
  const now = new Date();

  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [{ count: purgedTerminal }, { count: purgedFailed }, { count: purgedReports }] =
      await Promise.all([
        admin
          .from('notification_outbox')
          .delete({ count: 'exact' })
          .in('status', ['sent', 'skipped'])
          .lt('sent_at', cutoff30),
        admin
          .from('notification_outbox')
          .delete({ count: 'exact' })
          .eq('status', 'failed')
          .lt('created_at', cutoff90),
        admin
          .from('community_listing_reports')
          .delete({ count: 'exact' })
          .lt('created_at', cutoff180),
      ]);

    return NextResponse.json({
      ok: true,
      purged: {
        outbox_terminal: purgedTerminal ?? 0,
        outbox_failed: purgedFailed ?? 0,
        listing_reports: purgedReports ?? 0,
      },
    });
  } catch (err) {
    await log.error('[outbox-purge-cron] failed', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
