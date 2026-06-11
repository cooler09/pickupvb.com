import { describe, it, expect } from 'vitest';
import {
  monthlyNet,
  monthlySignups,
  revenueTotals,
  fillRate,
  needsAttention,
  type AuditRow,
  type EventLike,
} from './aggregate';

// Fixed reference clock so the trailing-window + "starting soon" branches are
// deterministic: 2026-06-15T12:00:00Z.
const NOW_MS = Date.UTC(2026, 5, 15, 12, 0, 0);

function event(overrides: Partial<EventLike> = {}): EventLike {
  return {
    id: 'e1',
    title: 'Event',
    starts_at: new Date(NOW_MS + 3 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'published',
    capacity_kind: 'fixed',
    max_spots: 12,
    attendee_count: 4,
    ...overrides,
  };
}

describe('monthlyNet', () => {
  it('buckets paid minus refunded into UTC months', () => {
    const rows: AuditRow[] = [
      { action: 'paid', amount_cents: 1000, occurred_at: '2026-06-02T00:00:00Z' },
      { action: 'paid', amount_cents: 500, occurred_at: '2026-06-20T00:00:00Z' },
      { action: 'refunded', amount_cents: 300, occurred_at: '2026-06-25T00:00:00Z' },
      { action: 'paid', amount_cents: 2000, occurred_at: '2026-05-10T00:00:00Z' },
    ];
    const out = monthlyNet(rows, NOW_MS, 6);
    const june = out.find((m) => m.key === '2026-06');
    const may = out.find((m) => m.key === '2026-05');
    expect(june?.net).toBe(1200); // 1000 + 500 − 300
    expect(may?.net).toBe(2000);
  });

  it('emits a continuous trailing window ending at the current month, oldest first', () => {
    const out = monthlyNet([], NOW_MS, 6);
    expect(out).toHaveLength(6);
    expect(out.map((m) => m.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    expect(out.every((m) => m.net === 0)).toBe(true);
    expect(out[0]?.label).toBe("Jan '26");
  });

  it('drops transactions older than the window', () => {
    const rows: AuditRow[] = [
      { action: 'paid', amount_cents: 9999, occurred_at: '2025-01-01T00:00:00Z' },
    ];
    const out = monthlyNet(rows, NOW_MS, 6);
    expect(out.some((m) => m.key === '2025-01')).toBe(false);
    expect(out.reduce((s, m) => s + m.net, 0)).toBe(0);
  });
});

describe('monthlySignups', () => {
  it('buckets attendee_count by the event month across a past→future window', () => {
    const events = [
      { starts_at: '2026-05-10T00:00:00Z', attendee_count: 4 },
      { starts_at: '2026-05-20T00:00:00Z', attendee_count: 6 },
      { starts_at: '2026-07-01T00:00:00Z', attendee_count: 9 }, // upcoming
    ];
    const out = monthlySignups(events, NOW_MS, 3, 2);
    // window: Mar, Apr, May, Jun, Jul, Aug 2026
    expect(out.map((m) => m.key)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
    expect(out.find((m) => m.key === '2026-05')?.net).toBe(10);
    expect(out.find((m) => m.key === '2026-07')?.net).toBe(9);
    expect(out.find((m) => m.key === '2026-06')?.net).toBe(0);
  });
});

describe('revenueTotals', () => {
  it('sums gross, refunds, and net', () => {
    const totals = revenueTotals([
      { action: 'paid', amount_cents: 1000 },
      { action: 'paid', amount_cents: 2500 },
      { action: 'refunded', amount_cents: 500 },
    ]);
    expect(totals).toEqual({ grossCents: 3500, refundedCents: 500, netCents: 3000 });
  });
});

describe('fillRate', () => {
  it('aggregates signed-up over capacity across fixed-capacity events', () => {
    const rate = fillRate([
      event({ max_spots: 10, attendee_count: 5 }),
      event({ max_spots: 10, attendee_count: 10 }),
    ]);
    expect(rate).toBe(0.75); // 15 / 20
  });

  it('ignores unlimited / capacity-less events', () => {
    const rate = fillRate([
      event({ capacity_kind: 'unlimited', max_spots: null, attendee_count: 50 }),
      event({ max_spots: 8, attendee_count: 4 }),
    ]);
    expect(rate).toBe(0.5); // only the fixed event counts: 4 / 8
  });

  it('returns null when no event has capacity set', () => {
    expect(fillRate([event({ capacity_kind: 'unlimited', max_spots: null })])).toBeNull();
  });
});

describe('needsAttention', () => {
  it('flags upcoming drafts to publish', () => {
    const items = needsAttention([event({ id: 'd', status: 'draft' })], NOW_MS);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'd', kind: 'draft' });
  });

  it('flags a full upcoming event over a merely-soon one', () => {
    const items = needsAttention([event({ id: 'full', max_spots: 8, attendee_count: 8 })], NOW_MS);
    expect(items[0]).toMatchObject({ id: 'full', kind: 'full' });
  });

  it('flags published events starting within 7 days', () => {
    const soon = new Date(NOW_MS + 2 * 24 * 60 * 60 * 1000).toISOString();
    const items = needsAttention([event({ id: 's', starts_at: soon, attendee_count: 1 })], NOW_MS);
    expect(items[0]).toMatchObject({ id: 's', kind: 'starting_soon' });
  });

  it('ignores past events and far-future published events', () => {
    const past = new Date(NOW_MS - 24 * 60 * 60 * 1000).toISOString();
    const far = new Date(NOW_MS + 60 * 24 * 60 * 60 * 1000).toISOString();
    const items = needsAttention(
      [
        event({ id: 'past', starts_at: past }),
        event({ id: 'far', starts_at: far, attendee_count: 1 }),
      ],
      NOW_MS,
    );
    expect(items).toHaveLength(0);
  });

  it('sorts soonest-first and caps to the limit', () => {
    const mk = (id: string, days: number) =>
      event({
        id,
        status: 'draft',
        starts_at: new Date(NOW_MS + days * 24 * 60 * 60 * 1000).toISOString(),
      });
    const items = needsAttention([mk('c', 9), mk('a', 1), mk('b', 5)], NOW_MS, 2);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
