import { describe, it, expect } from 'vitest';

import { zonedWallClockToUtc } from './timezone';

/**
 * Pins the community-import date fix: a draft's `startsAtLocal` is venue-local
 * wall-clock, so it must be anchored in the *venue* timezone before persisting.
 * The pre-fix code did `new Date('…T09:00')`, which parses in the server's zone
 * (UTC on Vercel) and stored imported times 4–5h off — the "9 AM shows as 5 AM"
 * bug. These assert the wall-clock lands on the right UTC instant per zone.
 */
describe('zonedWallClockToUtc', () => {
  it('interprets the wall-clock in America/New_York (EDT, summer) — 9am → 13:00Z', () => {
    expect(zonedWallClockToUtc('2026-06-06T09:00', 'America/New_York')?.toISOString()).toBe(
      '2026-06-06T13:00:00.000Z',
    );
  });

  it('honors DST: same zone in winter (EST) — 9am → 14:00Z', () => {
    expect(zonedWallClockToUtc('2026-01-10T09:00', 'America/New_York')?.toISOString()).toBe(
      '2026-01-10T14:00:00.000Z',
    );
  });

  it('interprets the wall-clock in America/Los_Angeles (PST) — 9am → 17:00Z', () => {
    expect(zonedWallClockToUtc('2026-01-10T09:00', 'America/Los_Angeles')?.toISOString()).toBe(
      '2026-01-10T17:00:00.000Z',
    );
  });

  it('keeps seconds when present', () => {
    expect(zonedWallClockToUtc('2026-06-06T09:30:15', 'America/New_York')?.toISOString()).toBe(
      '2026-06-06T13:30:15.000Z',
    );
  });

  it('falls back to UTC when the timezone is null (deterministic, server-independent)', () => {
    expect(zonedWallClockToUtc('2026-06-06T09:00', null)?.toISOString()).toBe(
      '2026-06-06T09:00:00.000Z',
    );
  });

  it('falls back to UTC for an unknown timezone rather than throwing', () => {
    expect(zonedWallClockToUtc('2026-06-06T09:00', 'Not/AZone')?.toISOString()).toBe(
      '2026-06-06T09:00:00.000Z',
    );
  });

  it('returns null for an unparseable wall-clock string', () => {
    expect(zonedWallClockToUtc('not-a-date', 'America/New_York')).toBeNull();
  });
});
