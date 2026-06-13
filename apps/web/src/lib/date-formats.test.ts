import { describe, expect, it } from 'vitest';
import { eventBucket, relativeEventDay } from './date-formats';

/**
 * relativeEventDay anchors "today" to the event's own timezone, not the
 * server's. These pin the day-diff buckets (Today / Tomorrow / weekday / null)
 * and the timezone anchoring — the part most likely to drift if the ordinal
 * math is "simplified".
 */
describe('relativeEventDay', () => {
  const tz = 'America/New_York';
  // Noon ET on 2026-06-14, so the ET calendar day is unambiguously 06-14.
  const now = new Date('2026-06-14T12:00:00-04:00');

  it('labels a later-the-same-day (ET) event "Today"', () => {
    expect(relativeEventDay(new Date('2026-06-14T22:00:00-04:00'), tz, now)).toBe('Today');
  });

  it('labels the next ET day "Tomorrow"', () => {
    expect(relativeEventDay(new Date('2026-06-15T18:00:00-04:00'), tz, now)).toBe('Tomorrow');
  });

  it('labels 2–6 days out with the short weekday', () => {
    const event = new Date('2026-06-17T18:00:00-04:00');
    const expected = event.toLocaleDateString(undefined, { weekday: 'short', timeZone: tz });
    expect(relativeEventDay(event, tz, now)).toBe(expected);
  });

  it('returns null beyond a week and for past events', () => {
    expect(relativeEventDay(new Date('2026-06-25T18:00:00-04:00'), tz, now)).toBeNull();
    expect(relativeEventDay(new Date('2026-06-10T18:00:00-04:00'), tz, now)).toBeNull();
  });

  it('anchors the day boundary to the event timezone, not UTC', () => {
    // 2026-06-15T01:00Z is still 06-14 (9pm) in ET → "Today", not "Tomorrow".
    expect(relativeEventDay(new Date('2026-06-15T01:00:00Z'), tz, now)).toBe('Today');
  });
});

/**
 * eventBucket coarsens the day-diff into the /community grouping headers. Pins
 * the boundaries (0 / 1 / ≤6 / ≤13 / beyond) and that past events collapse into
 * "Today" (order 0) — the upcoming list never shows past dates, but the bucket
 * must not crash or mislabel one if it slips through.
 */
describe('eventBucket', () => {
  const tz = 'America/New_York';
  const now = new Date('2026-06-14T12:00:00-04:00'); // noon ET, 06-14

  const cases: [string, number, string][] = [
    ['2026-06-14T22:00:00-04:00', 0, 'Today'],
    ['2026-06-15T18:00:00-04:00', 1, 'Tomorrow'],
    ['2026-06-20T18:00:00-04:00', 2, 'This week'], // 6 days out
    ['2026-06-21T18:00:00-04:00', 3, 'Next week'], // 7 days out
    ['2026-06-27T18:00:00-04:00', 3, 'Next week'], // 13 days out
    ['2026-06-28T18:00:00-04:00', 4, 'Later'], // 14 days out
    ['2026-06-10T18:00:00-04:00', 0, 'Today'], // past collapses to soonest
  ];
  for (const [iso, order, label] of cases) {
    it(`${iso} → ${label}`, () => {
      expect(eventBucket(new Date(iso), tz, now)).toEqual({ order, label });
    });
  }
});
