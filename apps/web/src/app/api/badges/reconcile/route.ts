/**
 * Badge reconcile cron (gamification Phase 1).
 *
 * The durable safety net behind reconcile-on-profile-view: it grants badges to
 * recently-active players who may not have opened their own profile since their
 * attendance/hosting facts changed. Idempotent — every grant is `on conflict do
 * nothing`, so re-running is free and a missed run self-heals on the next.
 *
 * Candidate set is bounded to "users whose counts could have just changed":
 * attendees of events that finished in the last 7 days, plus hosts who recently
 * published. The thresholds live in TS (`badge-catalog.ts`) — this route only
 * loops candidates through the reconcile handler; there is no SQL grant logic.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { ReconcileUserBadgesHandler } from '@pickupvb/application';
import { SupabaseBadgeRepository } from '@pickupvb/infrastructure';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const LOOKBACK_DAYS = 7;
const MAX_CANDIDATES_PER_RUN = 500;

function authorized(request: Request): boolean {
  const secret = process.env['CRON_SECRET'];
  if (!secret) return true; // dev fallback
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function candidateUserIds(
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<string[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Attendees of recently-finished events (their attendance counts just changed).
  const { data: attendeeRows } = await admin
    .from('event_participants')
    .select('user_id, division:event_divisions!inner(event:events!inner(ends_at, status))')
    .eq('role', 'attendee')
    .gte('division.event.ends_at', since)
    .lte('division.event.ends_at', now)
    .limit(MAX_CANDIDATES_PER_RUN);

  // Hosts who published recently (First Whistle).
  const { data: hostRows } = await admin
    .from('events')
    .select('host_id')
    .eq('status', 'published')
    .gte('updated_at', since)
    .not('host_id', 'is', null)
    .limit(MAX_CANDIDATES_PER_RUN);

  const ids = new Set<string>();
  for (const r of (attendeeRows as { user_id: string | null }[] | null) ?? []) {
    if (r.user_id) ids.add(r.user_id);
  }
  for (const r of (hostRows as { host_id: string | null }[] | null) ?? []) {
    if (r.host_id) ids.add(r.host_id);
  }
  return [...ids].slice(0, MAX_CANDIDATES_PER_RUN);
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const handler = new ReconcileUserBadgesHandler(new SupabaseBadgeRepository(admin));

  try {
    const candidates = await candidateUserIds(admin);
    let granted = 0;
    let reconciled = 0;
    for (const userId of candidates) {
      try {
        const newly = await handler.execute(userId);
        granted += newly.length;
        reconciled += 1;
      } catch (err) {
        await log.error('[badges-reconcile] user failed', { userId, err });
      }
    }
    return NextResponse.json({ ok: true, candidates: candidates.length, reconciled, granted });
  } catch (err) {
    await log.error('[badges-reconcile] failed', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
