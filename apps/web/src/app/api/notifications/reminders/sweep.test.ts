import { describe, it, expect } from 'vitest';

import {
  runReminderSweep,
  mapWithConcurrency,
  type ReminderPort,
  type ReminderEvent,
  type ReminderAttendee,
  type ReminderDispatch,
} from './sweep';

/**
 * TPI-14: the reminder sweep marks attendees `sent` *before* dispatching
 * (at-most-once). The bug was that an unbounded run could time out mid-loop and
 * strand a marked-but-undelivered tail. These pin the fix: a per-run budget caps
 * the work, and an attendee is never marked unless it's also dispatched. Uses a
 * fake `ReminderPort` so no Supabase is touched (mirrors notify.test.ts).
 */
function ev(id: string): ReminderEvent {
  return {
    id,
    title: `Event ${id}`,
    starts_at: '2026-06-01T18:00:00.000Z',
    location_city: 'Norfolk',
    location_region: 'VA',
    time_zone: 'America/New_York',
  };
}

type Fake = {
  port: ReminderPort;
  dispatch: ReminderDispatch;
  log: string[];
  dispatched: { kind: string; userId: string; idempotencyKey: string }[];
  markedIds: string[];
};

/**
 * @param windowEvents events returned per `findWindowEvents` call, in WINDOWS
 *   order ([24h, 2h]).
 * @param pools unreminded-attendee count keyed by event id.
 */
function makeFake(windowEvents: ReminderEvent[][], pools: Record<string, number>): Fake {
  const queue = [...windowEvents];
  const log: string[] = [];
  const dispatched: Fake['dispatched'] = [];
  const markedIds: string[] = [];
  const served: Record<string, number> = {};

  const port: ReminderPort = {
    findWindowEvents: async () => queue.shift() ?? [],
    findUnremindedAttendees: async (eventId, _column, limit) => {
      const total = pools[eventId] ?? 0;
      const already = served[eventId] ?? 0;
      const take = Math.max(0, Math.min(limit, total - already));
      served[eventId] = already + take;
      return Array.from(
        { length: take },
        (_, i): ReminderAttendee => ({
          id: `${eventId}-p${already + i}`,
          userId: `${eventId}-u${already + i}`,
        }),
      );
    },
    markReminded: async (_column, ids) => {
      log.push(`mark:${ids.length}`);
      markedIds.push(...ids);
    },
  };

  const dispatch: ReminderDispatch = async (kind, userId, _payload, opts) => {
    log.push(`dispatch:${userId}`);
    dispatched.push({ kind, userId, idempotencyKey: opts.idempotencyKey });
  };

  return { port, dispatch, log, dispatched, markedIds };
}

const NOW = new Date('2026-05-31T12:00:00.000Z');

describe('runReminderSweep — per-run cap (TPI-14)', () => {
  it('stops at the budget and defers the overflow instead of marking-then-dropping', async () => {
    // Two events, 2 attendees each (4 total); budget 3.
    const f = makeFake([[ev('A'), ev('B')], []], { A: 2, B: 2 });
    const res = await runReminderSweep(f.port, f.dispatch, NOW, 3, 4);
    expect(res.reminders).toBe(3);
    expect(f.dispatched).toHaveLength(3);
    // The 4th attendee was neither marked nor dispatched — deferred to next run.
    expect(f.markedIds).toHaveLength(3);
    expect(res.capped).toBe(true);
  });

  it('never marks an attendee it does not dispatch (the no-silent-drop invariant)', async () => {
    const f = makeFake([[ev('A')], []], { A: 10 });
    await runReminderSweep(f.port, f.dispatch, NOW, 4, 4);
    expect(f.markedIds.length).toBe(f.dispatched.length);
    expect(f.markedIds.length).toBe(4);
  });

  it("marks an event's batch BEFORE dispatching it (at-most-once ordering)", async () => {
    const f = makeFake([[ev('A')], []], { A: 3 });
    await runReminderSweep(f.port, f.dispatch, NOW, 10, 4);
    expect(f.log[0]).toBe('mark:3');
    expect(f.log.slice(1).sort()).toEqual(['dispatch:A-u0', 'dispatch:A-u1', 'dispatch:A-u2']);
  });

  it('keys each reminder per (kind, event, user) for outbox idempotency', async () => {
    const f = makeFake([[ev('A')], []], { A: 1 });
    await runReminderSweep(f.port, f.dispatch, NOW, 10, 4);
    expect(f.dispatched[0]!.idempotencyKey).toBe('event.reminder.24h:A:A-u0');
  });

  it('shares the budget across both windows (24h consumes it → 2h gets nothing)', async () => {
    const f = makeFake([[ev('A')], [ev('B')]], { A: 3, B: 5 });
    const res = await runReminderSweep(f.port, f.dispatch, NOW, 3, 4);
    expect(res.reminders).toBe(3);
    expect(f.dispatched.every((d) => d.kind === 'event.reminder.24h')).toBe(true);
    const twoHour = res.windows.find((w) => w.kind === 'event.reminder.2h')!;
    expect(twoHour.reminders).toBe(0);
    expect(twoHour.capped).toBe(true);
  });
});

describe('mapWithConcurrency', () => {
  it('processes every item without exceeding the concurrency bound', async () => {
    let active = 0;
    let maxActive = 0;
    const seen: number[] = [];
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      5,
      async (n) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 1));
        seen.push(n);
        active -= 1;
      },
    );
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(maxActive).toBeLessThanOrEqual(5);
    expect(maxActive).toBeGreaterThan(1); // actually ran in parallel
  });

  it('handles fewer items than the concurrency bound', async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2], 8, async (n) => {
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2]);
  });
});
