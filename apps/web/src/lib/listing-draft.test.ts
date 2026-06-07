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
      addressLine: null,
      city: null,
      region: null,
      postalCode: null,
      country: null,
      surface: 'grass',
      format: null,
      skillLevel: null,
    });
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
