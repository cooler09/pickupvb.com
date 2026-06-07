/**
 * Auto-approve community-listing claims left un-reviewed for 7 days — the
 * deferred "Stage B" of migration 20260613000000 (audit CL-4).
 *
 * A claim moves a listing to `claim_pending` and waits on the original
 * submitter (or a platform admin). Without a backstop a claim could sit
 * forever — acute for admin-bulk-imported listings, where the admin is the
 * silent approver for every claim. This cron approves the stragglers and pings
 * each claimant that their listing now points at their event.
 *
 * Auth mirrors the other notification crons (Bearer `CRON_SECRET`, dev-open).
 */
import { NextResponse } from 'next/server';
import { handlers } from '@/lib/handlers';
import { notifyClaimApproved } from '@/lib/notify-community';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const AUTO_APPROVE_AFTER_DAYS = 7;

async function authorized(request: Request): Promise<boolean> {
  const secret = process.env['CRON_SECRET'];
  if (!secret) return true; // dev fallback
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - AUTO_APPROVE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  try {
    const approved = await handlers.autoApproveExpiredCommunityClaims.execute(cutoff);
    // Best-effort claimant pings; a failed notify must not fail the cron.
    for (const { listingId } of approved) {
      await notifyClaimApproved(listingId);
    }
    return NextResponse.json({ ok: true, approved: approved.length });
  } catch (err) {
    await log.error('[community-claims-auto-approve] failed', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
