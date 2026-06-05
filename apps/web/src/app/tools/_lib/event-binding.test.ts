import { describe, it, expect } from 'vitest';
import { parseEventBinding, eventToolHref } from './event-binding';

const EVENT = '11111111-1111-1111-1111-111111111111';
const DIVISION = '22222222-2222-2222-2222-222222222222';

describe('parseEventBinding', () => {
  it('returns null when no event param is present', () => {
    expect(parseEventBinding(undefined)).toBeNull();
    expect(parseEventBinding({})).toBeNull();
  });

  it('returns null for a non-UUID event id (bots / garbage params never load an event)', () => {
    expect(parseEventBinding({ event: 'not-a-uuid' })).toBeNull();
    expect(parseEventBinding({ event: '123' })).toBeNull();
  });

  it('parses a bare event binding, defaulting ret to the event manage page', () => {
    expect(parseEventBinding({ event: EVENT })).toEqual({
      eventId: EVENT,
      ret: `/events/${EVENT}/manage`,
    });
  });

  it('includes a valid division and an app-relative ret (with query string)', () => {
    expect(
      parseEventBinding({
        event: EVENT,
        division: DIVISION,
        ret: `/events/${EVENT}/bracket?division=${DIVISION}`,
      }),
    ).toEqual({
      eventId: EVENT,
      divisionId: DIVISION,
      ret: `/events/${EVENT}/bracket?division=${DIVISION}`,
    });
  });

  it('drops a non-UUID division but keeps the event', () => {
    expect(parseEventBinding({ event: EVENT, division: 'bad' })).toEqual({
      eventId: EVENT,
      ret: `/events/${EVENT}/manage`,
    });
  });

  it('rejects an off-site ret (open-redirect guard) and falls back to manage', () => {
    expect(parseEventBinding({ event: EVENT, ret: 'https://evil.example.com' })?.ret).toBe(
      `/events/${EVENT}/manage`,
    );
    expect(parseEventBinding({ event: EVENT, ret: '//evil.example.com' })?.ret).toBe(
      `/events/${EVENT}/manage`,
    );
  });

  it('takes the first value when a param arrives as an array', () => {
    expect(parseEventBinding({ event: [EVENT, 'x'] as unknown as string })?.eventId).toBe(EVENT);
  });
});

describe('eventToolHref', () => {
  it('builds a /tools/<slug> url carrying event + ret (+ division when given)', () => {
    const href = eventToolHref('seeding', { eventId: EVENT, divisionId: DIVISION, ret: '/r' });
    expect(href).toContain('/tools/seeding?');
    expect(href).toContain(`event=${EVENT}`);
    expect(href).toContain(`division=${DIVISION}`);
    expect(href).toContain('ret=%2Fr');
  });

  it('omits the division param when none is bound', () => {
    const href = eventToolHref('team-randomizer', { eventId: EVENT, ret: '/r' });
    expect(href).toContain('/tools/team-randomizer?');
    expect(href).not.toContain('division=');
  });
});
