import { describe, expect, it } from 'vitest';
import { relativeEventDay } from './date-formats';

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
