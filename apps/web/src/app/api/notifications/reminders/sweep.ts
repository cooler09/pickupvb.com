/**
 * Reminder sweep core (TPI-14). Pure orchestration over an injected
 * `ReminderPort` + dispatch fn — no Supabase, no `next/*` — so the cap /
 * ordering / fan-out is unit-testable (mirrors `dispatch` in lib/notify.ts).
 * The route ([route.ts](./route.ts)) wires the concrete port + `notify`.
 *
 * Why this lives in its own module: a Next `route.ts` may only export route
 * handlers + route config; exporting these helpers from the route file fails
 * the generated route-type check.
 */

/**
 * Hard cap on reminders enqueued per invocation. Sized so a run stays well
 * inside the route's `maxDuration` (60s) even with the per-attendee prefs read +
 * auth email lookup `notify()` does. The reminder windows are wide (4h / 1h) and
 * the cron fires every 15 min, so a capped run defers the remainder to the next
 * run without missing the window — which is what stops a timeout from stranding
 * a marked-but-undelivered tail (the original bug).
 */
export const MAX_REMINDERS_PER_RUN = 250;

/**
 * Fan-out concurrency for the dispatch fn. Each `notify()` does a prefs read + an
 * auth email lookup + inserts, so a little parallelism clears the cap in seconds.
 * Sequential dispatch (the prior behavior) is what put a large window at risk of
 * the `maxDuration` timeout.
 */
export const DISPATCH_CONCURRENCY = 8;

export type ReminderKind = 'event.reminder.24h' | 'event.reminder.2h';
export type ReminderColumn = 'reminder_24h_sent_at' | 'reminder_2h_sent_at';

type ReminderWindow = {
  kind: ReminderKind;
  column: ReminderColumn;
  /** Window start / end as minutes-from-now. */
  fromMin: number;
  toMin: number;
};

const WINDOWS: readonly ReminderWindow[] = [
  { kind: 'event.reminder.24h', column: 'reminder_24h_sent_at', fromMin: 22 * 60, toMin: 26 * 60 },
  { kind: 'event.reminder.2h', column: 'reminder_2h_sent_at', fromMin: 90, toMin: 150 },
];

export type ReminderEvent = {
  id: string;
  title: string;
  starts_at: string;
  location_city: string | null;
  location_region: string | null;
};

export type ReminderAttendee = { id: string; userId: string };

export type ReminderPayload = {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  location: string;
};

/**
 * The DB seams the sweep needs, factored out so they can be faked in tests.
 * `findUnremindedAttendees` takes a `limit` so the sweep pulls only as many rows
 * as the remaining budget allows (the rest stay unmarked for the next run).
 */
export interface ReminderPort {
  findWindowEvents(windowStart: Date, windowEnd: Date): Promise<ReminderEvent[]>;
  findUnremindedAttendees(
    eventId: string,
    column: ReminderColumn,
    limit: number,
  ): Promise<ReminderAttendee[]>;
  markReminded(column: ReminderColumn, participantIds: string[]): Promise<void>;
}

export type ReminderDispatch = (
  kind: ReminderKind,
  userId: string,
  payload: ReminderPayload,
  opts: { idempotencyKey: string },
) => Promise<void>;

export type WindowResult = {
  kind: ReminderKind;
  events: number;
  reminders: number;
  capped: boolean;
};
export type SweepResult = { windows: WindowResult[]; reminders: number; capped: boolean };

function locationOf(e: ReminderEvent): string {
  return [e.location_city, e.location_region].filter(Boolean).join(', ');
}

/**
 * Run `fn` over `items` with at most `concurrency` in flight. Resolves once all
 * complete (or rejects on the first rejection). Exported for direct testing.
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lanes = Math.min(Math.max(concurrency, 1), items.length);
  const workers = Array.from({ length: lanes }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function sweepWindow(
  port: ReminderPort,
  dispatch: ReminderDispatch,
  win: ReminderWindow,
  now: Date,
  budget: number,
  concurrency: number,
): Promise<WindowResult> {
  const windowStart = new Date(now.getTime() + win.fromMin * 60_000);
  const windowEnd = new Date(now.getTime() + win.toMin * 60_000);
  const events = await port.findWindowEvents(windowStart, windowEnd);

  let reminders = 0;
  let eventsTouched = 0;
  let capped = false;

  for (const ev of events) {
    const room = budget - reminders;
    if (room <= 0) {
      capped = true;
      break;
    }

    const attendees = await port.findUnremindedAttendees(ev.id, win.column, room);
    if (attendees.length === 0) continue;
    eventsTouched += 1;

    // Mark sent FIRST — at-most-once (better to miss than spam; the reminder
    // kinds include the non-idempotent in_app channel). The cap above keeps the
    // run inside maxDuration, so this can't strand a large tail.
    await port.markReminded(
      win.column,
      attendees.map((a) => a.id),
    );

    const location = locationOf(ev);
    await mapWithConcurrency(attendees, concurrency, (att) =>
      dispatch(
        win.kind,
        att.userId,
        { eventId: ev.id, eventTitle: ev.title, startsAt: ev.starts_at, location },
        { idempotencyKey: `${win.kind}:${ev.id}:${att.userId}` },
      ),
    );

    reminders += attendees.length;
    if (attendees.length >= room) {
      // Took the whole remaining budget for this window — defer the rest.
      capped = true;
      break;
    }
  }

  return { kind: win.kind, events: eventsTouched, reminders, capped };
}

/**
 * Sweep both reminder windows under a shared per-run budget.
 */
export async function runReminderSweep(
  port: ReminderPort,
  dispatch: ReminderDispatch,
  now: Date,
  maxReminders: number = MAX_REMINDERS_PER_RUN,
  concurrency: number = DISPATCH_CONCURRENCY,
): Promise<SweepResult> {
  const windows: WindowResult[] = [];
  let remaining = maxReminders;

  for (const win of WINDOWS) {
    if (remaining <= 0) {
      windows.push({ kind: win.kind, events: 0, reminders: 0, capped: true });
      continue;
    }
    const res = await sweepWindow(port, dispatch, win, now, remaining, concurrency);
    remaining -= res.reminders;
    windows.push(res);
  }

  return {
    windows,
    reminders: maxReminders - remaining,
    capped: windows.some((w) => w.capped),
  };
}
