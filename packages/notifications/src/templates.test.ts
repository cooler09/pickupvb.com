import { describe, it, expect } from 'vitest';

import { renderInApp, renderEmail } from './templates.js';

/**
 * Notifications audit P2 #8: every "Tomorrow at …" / "Starting soon …" /
 * kickoff line used to render in the runtime's zone (UTC on Vercel), so a 7 PM
 * ET event read as midnight. These pin the fix: times render in the event's
 * `timeZone` when supplied, and fall back to the app's home zone (ET) — never
 * UTC — when it's absent.
 *
 * Reference instant: 2026-07-01T23:30:00Z (summer, so DST is in effect).
 *   ET  (EDT, UTC-4): 7:30 PM
 *   PT  (PDT, UTC-7): 4:30 PM
 *   UTC:              11:30 PM   ← the bug
 *
 * Assert on the hour:minute (the timezone-sensitive part) rather than the full
 * "7:30 PM" string — `Intl` separates the time and meridiem with a narrow
 * no-break space (U+202F) on modern Node, not an ASCII space.
 */
const ISO = '2026-07-01T23:30:00.000Z';

describe('template time formatting honors the event timezone (audit P2 #8)', () => {
  it('falls back to ET (not UTC) when no timeZone is supplied', () => {
    const r = renderInApp('event.reminder.24h', {
      eventId: 'e1',
      eventTitle: 'Open Play',
      startsAt: ISO,
      location: 'Norfolk, VA',
    });
    expect(r.body).toContain('7:30');
    expect(r.body).not.toContain('11:30');
  });

  it('renders in the supplied IANA zone', () => {
    const r = renderInApp('event.reminder.24h', {
      eventId: 'e1',
      eventTitle: 'Open Play',
      startsAt: ISO,
      location: 'Santa Monica, CA',
      timeZone: 'America/Los_Angeles',
    });
    expect(r.body).toContain('4:30');
    expect(r.body).not.toContain('7:30');
  });

  it('threads the zone into the email body too', () => {
    const r = renderEmail('event.reminder.24h', {
      eventId: 'e1',
      eventTitle: 'Open Play',
      startsAt: ISO,
      location: 'Norfolk, VA',
      timeZone: 'America/New_York',
    });
    expect(r.text).toContain('7:30');
    expect(r.html).toContain('7:30');
  });
});
