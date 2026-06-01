/**
 * Account-deletion cron (ADR 0029, privacy P1 #2). Daily sweep that purges every
 * deletion request whose 30-day grace window has elapsed.
 *
 * Same shape as the reminders cron: `CRON_SECRET` Bearer auth, service-role
 * client, work isolated behind a testable port ([sweep.ts](./sweep.ts)). The
 * destructive per-account work lives in `executeAccountDeletion`
 * ([lib/account-purge.ts](../../../../lib/account-purge.ts)) — scrub → Stripe
 * cancel → notification cleanup → mark executed → hard-delete the auth user.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { SupabaseDeletionRequestRepository } from '@pickupvb/infrastructure';
import { executeAccountDeletion } from '@/lib/account-purge';
import { log } from '@/lib/log';
import { runDeletionSweep, type DeletionPort } from './sweep';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function authorized(request: Request): Promise<boolean> {
  const secret = process.env['CRON_SECRET'];
  if (!secret) return true; // dev fallback
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const repo = new SupabaseDeletionRequestRepository(admin);
  const port: DeletionPort = {
    findDue: (now, limit) => repo.findDueForExecution(now, limit),
    execute: (req) => executeAccountDeletion(admin, repo, req),
  };

  try {
    const result = await runDeletionSweep(port, new Date(), (req, err) => {
      void log.error('[execute-deletions] purge failed', err, { requestId: req.id });
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await log.error('[execute-deletions] sweep failed', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
