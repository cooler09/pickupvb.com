import { describe, it, expect } from 'vitest';
import { coerceDraft, parseDraftsJson } from './listing-draft';

describe('coerceDraft', () => {
  it('trims strings, nulls blanks, and rejects invalid enum values', () => {
    expect(
      coerceDraft({ title: '  Hi there  ', surface: 'grass', format: 'nope', region: '' }),
    ).toEqual({
      title: 'Hi there',
      description: '',
      externalUrl: '',
      externalHostName: null,
      startsAtLocal: '',
      endsAtLocal: null,
      allDay: false,
      addressLine: null,
      city: null,
      region: null,
      postalCode: null,
      country: null,
      latitude: null,
      longitude: null,
      surface: 'grass',
      format: null,
      skillLevel: null,
    });
  });

  it('parses lat/lng (incl. numeric strings) and nulls non-finite/missing', () => {
    // Sources like the Volleyball Life API ship exact venue coords; the importer
    // uses them directly (skips geocoding) only when both are finite numbers.
    expect(coerceDraft({ title: 'Coords', latitude: 33.77, longitude: -118.19 })).toMatchObject({
      latitude: 33.77,
      longitude: -118.19,
    });
    expect(coerceDraft({ title: 'Strings', latitude: '40.5', longitude: '-74.1' })).toMatchObject({
      latitude: 40.5,
      longitude: -74.1,
    });
    expect(coerceDraft({ title: 'Missing/bad', latitude: 'NaN' })).toMatchObject({
      latitude: null,
      longitude: null,
    });
  });

  it('coerces allDay to a strict boolean — only literal true counts', () => {
    // The all-day flag drives "render the date with no time"; a truthy-but-not-
    // true value (or a missing key) must default to a timed listing, not opt in.
    expect(coerceDraft({ title: 'Date-only tourney', allDay: true }).allDay).toBe(true);
    expect(coerceDraft({ title: 'Timed', allDay: 'yes' }).allDay).toBe(false);
    expect(coerceDraft({ title: 'Missing key' }).allDay).toBe(false);
  });

  it('defends against a non-object row', () => {
    expect(coerceDraft(null).title).toBe('');
    expect(coerceDraft('nope').title).toBe('');
  });
});

describe('parseDraftsJson', () => {
  const valid = JSON.stringify([
    {
      title: 'Saturday Beach Doubles',
      externalUrl: 'https://www.facebook.com/events/1',
      startsAtLocal: '2026-07-11T09:00',
      city: 'Erie',
      country: 'United States',
      surface: 'sand',
      format: 'doubles',
      skillLevel: 'wizard', // invalid — coerced to null
    },
  ]);

  it('parses a bare array and coerces each row', () => {
    const drafts = parseDraftsJson(valid);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      title: 'Saturday Beach Doubles',
      surface: 'sand',
      format: 'doubles',
      skillLevel: null,
      city: 'Erie',
    });
  });

  it('accepts the { listings: [...] } envelope shape', () => {
    const drafts = parseDraftsJson(`{ "listings": ${valid} }`);
    expect(drafts.map((d) => d.title)).toEqual(['Saturday Beach Doubles']);
  });

  it('drops rows without a usable (>=3 char) title', () => {
    const drafts = parseDraftsJson(JSON.stringify([{ title: 'ab' }, { title: 'Real event' }]));
    expect(drafts.map((d) => d.title)).toEqual(['Real event']);
  });

  it('throws on empty input', () => {
    expect(() => parseDraftsJson('   ')).toThrow(/no json/i);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseDraftsJson('{not json')).toThrow(/not valid json/i);
  });

  it('throws on a non-array / non-envelope payload', () => {
    expect(() => parseDraftsJson('{"title":"solo object"}')).toThrow(/array of listings/i);
  });

  it('throws when no row has a usable title', () => {
    expect(() => parseDraftsJson(JSON.stringify([{ title: 'ab' }, {}]))).toThrow(/usable title/i);
  });
});
