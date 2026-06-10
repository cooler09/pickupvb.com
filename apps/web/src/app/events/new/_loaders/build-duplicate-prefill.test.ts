import { describe, it, expect } from 'vitest';
import { buildDuplicatePrefill, type DuplicateSource } from './build-duplicate-prefill';

function source(overrides: Partial<DuplicateSource> = {}): DuplicateSource {
  return {
    title: 'Thursday Night Open Play',
    description: 'Casual 6s.',
    rules: 'Rally scoring to 25.',
    type: 'open_play',
    surface: 'indoor',
    visibility: 'public',
    format: null,
    gender: null,
    location: {
      addressLine: '123 Court St',
      city: 'Virginia Beach',
      region: 'VA',
      postalCode: '23451',
      country: 'US',
    },
    divisions: [{ skillTier: 'bb', capacityKind: 'fixed', maxSpots: 24 }],
    ...overrides,
  };
}

describe('buildDuplicatePrefill', () => {
  it('maps the core descriptive + location fields', () => {
    const out = buildDuplicatePrefill(source());
    expect(out).toMatchObject({
      title: 'Thursday Night Open Play',
      description: 'Casual 6s.',
      rules: 'Rally scoring to 25.',
      type: 'open_play',
      surface: 'indoor',
      visibility: 'public',
      addressLine: '123 Court St',
      city: 'Virginia Beach',
      region: 'VA',
      postalCode: '23451',
      country: 'US',
    });
  });

  it('seeds skill + fixed capacity from the primary division', () => {
    const out = buildDuplicatePrefill(source());
    expect(out.skillTier).toBe('bb');
    expect(out.capacityKind).toBe('fixed');
    expect(out.maxSpots).toBe('24');
  });

  it('omits capacity keys for an unlimited division (falls back to the form default)', () => {
    const out = buildDuplicatePrefill(
      source({ divisions: [{ skillTier: 'a', capacityKind: 'unlimited', maxSpots: null }] }),
    );
    expect(out.skillTier).toBe('a');
    expect('capacityKind' in out).toBe(false);
    expect('maxSpots' in out).toBe(false);
  });

  it('never carries date or pricing fields', () => {
    const out = buildDuplicatePrefill(source());
    for (const key of ['startsAt', 'endsAt', 'priceUsd', 'hostAbsorbsFee']) {
      expect(key in out).toBe(false);
    }
  });

  it('includes format/gender only when present', () => {
    expect('format' in buildDuplicatePrefill(source())).toBe(false);
    const out = buildDuplicatePrefill(source({ format: 'single_elim', gender: 'coed' }));
    expect(out.format).toBe('single_elim');
    expect(out.gender).toBe('coed');
  });

  it('tolerates an event with no divisions', () => {
    const out = buildDuplicatePrefill(source({ divisions: [] }));
    expect('skillTier' in out).toBe(false);
    expect(out.title).toBe('Thursday Night Open Play');
  });
});
