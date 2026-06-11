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
 * published. The thresholds live in TS (`badge-catalog.ts`) — this route loops
 * candidates through the same `reconcileUserBadges` facade the profile view
 * uses, so cron-driven grants (system + on_attend host badges) also fire the
 * `badge.earned` bell instead of landing silently.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { log } from '@/lib/log';
import { isCronAuthorized } from '@/lib/cron-auth';
import { reconcileUserBadges } from '@/lib/badges';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const LOOKBACK_DAYS = 7;
const MAX_CANDIDATES_PER_RUN = 500;

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
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  try {
    const candidates = await candidateUserIds(admin);
    let granted = 0;
    // Drain each candidate through the same facade the profile view uses — it
    // grants on_attend host badges *and* system badges and fires the
    // `badge.earned` bell, so a player who earns a badge without visiting their
    // profile still gets it (and is notified). The facade is fail-quiet, so a
    // single user's hiccup degrades to "no new badges" rather than aborting the
    // run.
    for (const userId of candidates) {
      const newly = await reconcileUserBadges(userId);
      granted += newly.length;
    }
    return NextResponse.json({ ok: true, candidates: candidates.length, granted });
  } catch (err) {
    await log.error('[badges-reconcile] failed', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
