/**
 * Reminder cron. Fires `event.reminder.24h` and `event.reminder.2h` for
 * attendees of upcoming events.
 *
 *   24h window: events starting in 22-26h that haven't been reminded
 *   2h  window: events starting in 90min-150min that haven't been reminded
 *
 * Dedupe is at the attendee row level via `reminder_24h_sent_at` /
 * `reminder_2h_sent_at`. We mark sent BEFORE dispatching so a partial failure
 * can't re-fire — at-most-once over at-least-once (better to miss one than
 * spam; the reminder kinds include the non-idempotent `in_app` channel, so a
 * re-fire would duplicate the bell entry).
 *
 * **Bounded per run (TPI-14).** Marking sent before dispatch means an unbounded
 * run could time out mid-loop and strand a marked-but-undelivered tail. The
 * sweep core caps the work at `MAX_REMINDERS_PER_RUN` and fans each event's
 * attendees out with bounded concurrency, so a run always finishes well inside
 * `maxDuration`. The orchestration lives in [sweep.ts](./sweep.ts) behind an
 * injected `ReminderPort` so it's unit-testable; this file just wires the
 * Supabase-backed port + `notify` and handles auth.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { notify } from '@/lib/notify';
import { log } from '@/lib/log';
import {
  runReminderSweep,
  type ReminderColumn,
  type ReminderDispatch,
  type ReminderEvent,
  type ReminderPort,
} from './sweep';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function makeReminderPort(admin: ReturnType<typeof createSupabaseAdminClient>): ReminderPort {
  return {
    async findWindowEvents(windowStart, windowEnd) {
      const { data } = await admin
        .from('events')
        .select('id, title, starts_at, location_city, location_region')
        .gte('starts_at', windowStart.toISOString())
        .lte('starts_at', windowEnd.toISOString())
        .neq('status', 'cancelled');
      return (data as ReminderEvent[] | null) ?? [];
    },
    async findUnremindedAttendees(eventId, column: ReminderColumn, limit) {
      const { data } = await admin
        .from('event_participants')
        .select('id, user_id, division:event_divisions!inner(event_id)')
        .eq('role', 'attendee')
        .eq('division.event_id', eventId)
        .is(column, null)
        .limit(limit);
      const rows = (data as { id: string; user_id: string }[] | null) ?? [];
      return rows.map((r) => ({ id: r.id, userId: r.user_id }));
    },
    async markReminded(column: ReminderColumn, participantIds) {
      if (participantIds.length === 0) return;
      await admin
        .from('event_participants')
        .update({ [column]: new Date().toISOString() } as never)
        .in('id', participantIds);
    },
  };
}

async function authorized(request: Request): Promise<boolean> {
  const secret = process.env['CRON_SECRET'];
  if (!secret) return true; // dev fallback
  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const dispatch: ReminderDispatch = (kind, userId, payload, opts) =>
    notify(kind, userId, payload, opts);

  try {
    const result = await runReminderSweep(makeReminderPort(admin), dispatch, new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await log.error('[reminders-cron] failed', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
