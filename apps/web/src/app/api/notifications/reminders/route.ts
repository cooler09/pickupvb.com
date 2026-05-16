/**
 * Reminder cron. Fires `event.reminder.24h` and `event.reminder.2h` for
 * attendees of upcoming events.
 *
 *   24h window: events starting in 22-26h that haven't been reminded
 *   2h  window: events starting in 90min-150min that haven't been reminded
 *
 * Dedupe is at the attendee row level via `reminder_24h_sent_at` /
 * `reminder_2h_sent_at`. We mark sent BEFORE dispatching so a partial
 * failure can't re-fire — accepting at-most-once over at-least-once for
 * reminders (better to miss one than spam).
 *
 * Schedule: every 15 minutes is enough granularity. Vercel cron runs this.
 */
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@pickupvb/supabase';
import { notify } from '@/lib/notify';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type EventRow = {
    id: string;
    title: string;
    starts_at: string;
    location_city: string | null;
    location_region: string | null;
};

type AttendeeRow = {
    event_id: string;
    user_id: string;
};

async function authorized(request: Request): Promise<boolean> {
    const secret = process.env['CRON_SECRET'];
    if (!secret) return true; // dev fallback
    const header = request.headers.get('authorization');
    return header === `Bearer ${secret}`;
}

function locationOf(e: EventRow): string {
    return [e.location_city, e.location_region].filter(Boolean).join(', ');
}

async function sendBatch(
    admin: ReturnType<typeof createSupabaseAdminClient>,
    kind: 'event.reminder.24h' | 'event.reminder.2h',
    columnName: 'reminder_24h_sent_at' | 'reminder_2h_sent_at',
    windowStart: Date,
    windowEnd: Date,
): Promise<{ events: number; reminders: number }> {
    // Find events in the time window.
    const { data: eventRows } = await admin
        .from('events')
        .select('id, title, starts_at, location_city, location_region')
        .gte('starts_at', windowStart.toISOString())
        .lte('starts_at', windowEnd.toISOString())
        .neq('status', 'cancelled');
    const events = (eventRows as EventRow[] | null) ?? [];
    if (events.length === 0) return { events: 0, reminders: 0 };

    let totalReminders = 0;
    for (const ev of events) {
        // Find attendees of this event who haven't been reminded yet.
        const { data: attRows } = await admin
            .from('event_attendees')
            .select('event_id, user_id')
            .eq('event_id', ev.id)
            .is(columnName, null);
        const attendees = (attRows as AttendeeRow[] | null) ?? [];
        if (attendees.length === 0) continue;

        // Mark sent FIRST to prevent double-fire on cron overlap.
        const userIds = attendees.map((a) => a.user_id);
        await admin
            .from('event_attendees')
            .update({ [columnName]: new Date().toISOString() } as never)
            .eq('event_id', ev.id)
            .in('user_id', userIds);

        const location = locationOf(ev);
        // Dispatch sequentially to avoid hammering rate limits.
        for (const att of attendees) {
            await notify(
                kind,
                att.user_id,
                {
                    eventId: ev.id,
                    eventTitle: ev.title,
                    startsAt: ev.starts_at,
                    location,
                },
                { idempotencyKey: `${kind}:${ev.id}:${att.user_id}` },
            );
            totalReminders += 1;
        }
    }
    return { events: events.length, reminders: totalReminders };
}

export async function GET(request: Request): Promise<NextResponse> {
    if (!(await authorized(request))) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const now = new Date();

    try {
        const r24 = await sendBatch(
            admin,
            'event.reminder.24h',
            'reminder_24h_sent_at',
            new Date(now.getTime() + 22 * 60 * 60 * 1000),
            new Date(now.getTime() + 26 * 60 * 60 * 1000),
        );
        const r2 = await sendBatch(
            admin,
            'event.reminder.2h',
            'reminder_2h_sent_at',
            new Date(now.getTime() + 90 * 60 * 1000),
            new Date(now.getTime() + 150 * 60 * 1000),
        );
        return NextResponse.json({
            ok: true,
            r24: r24,
            r2: r2,
        });
    } catch (err) {
        await log.error('[reminders-cron] failed', err);
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
