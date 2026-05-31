import { describe, it, expect } from 'vitest';
import { Location } from './location.js';
import { InvariantViolation } from '../shared/result.js';

/** Minimal valid location props; override per case. */
function props(overrides: Partial<Parameters<typeof Location.create>[0]> = {}) {
  return {
    addressLine: '123 Beach Rd',
    city: 'Virginia Beach',
    region: 'VA',
    postalCode: '23451',
    country: 'USA',
    latitude: 36.85,
    longitude: -75.98,
    ...overrides,
  };
}

describe('Location.create', () => {
  it('constructs a valid location and trims string fields', () => {
    const loc = Location.create(
      props({
        addressLine: '  123 Beach Rd  ',
        city: '  Virginia Beach  ',
        region: '  VA  ',
        postalCode: '  23451  ',
        country: '  USA  ',
      }),
    );
    expect(loc.addressLine).toBe('123 Beach Rd');
    expect(loc.city).toBe('Virginia Beach');
    expect(loc.region).toBe('VA');
    expect(loc.postalCode).toBe('23451');
    expect(loc.country).toBe('USA');
    expect(loc.latitude).toBe(36.85);
    expect(loc.longitude).toBe(-75.98);
  });

  describe('latitude bounds', () => {
    it('rejects latitude below -90', () => {
      expect(() => Location.create(props({ latitude: -90.1 }))).toThrow(InvariantViolation);
    });

    it('rejects latitude above 90', () => {
      expect(() => Location.create(props({ latitude: 90.1 }))).toThrow(InvariantViolation);
    });

    it('accepts the -90 and 90 boundaries', () => {
      expect(Location.create(props({ latitude: -90 })).latitude).toBe(-90);
      expect(Location.create(props({ latitude: 90 })).latitude).toBe(90);
    });
  });

  describe('longitude bounds', () => {
    it('rejects longitude below -180', () => {
      expect(() => Location.create(props({ longitude: -180.1 }))).toThrow(InvariantViolation);
    });

    it('rejects longitude above 180', () => {
      expect(() => Location.create(props({ longitude: 180.1 }))).toThrow(InvariantViolation);
    });

    it('accepts the -180 and 180 boundaries', () => {
      expect(Location.create(props({ longitude: -180 })).longitude).toBe(-180);
      expect(Location.create(props({ longitude: 180 })).longitude).toBe(180);
    });
  });

  describe('required fields', () => {
    it('rejects a blank city', () => {
      expect(() => Location.create(props({ city: '   ' }))).toThrow(InvariantViolation);
    });

    it('rejects a blank country', () => {
      expect(() => Location.create(props({ country: '   ' }))).toThrow(InvariantViolation);
    });

    it('allows a blank address line, region, and postal code', () => {
      const loc = Location.create(props({ addressLine: '', region: '', postalCode: '' }));
      expect(loc.addressLine).toBe('');
      expect(loc.region).toBe('');
      expect(loc.postalCode).toBe('');
    });
  });
});
