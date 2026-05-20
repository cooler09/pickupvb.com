import { describe, it, expect } from 'vitest';
import { Format, Surface } from './enums.js';
import { isFormatAllowedForSurface, playersPerSide } from './rules.js';
import { assertFormatAllowedForSurface } from './rules.js';
import { InvariantViolation } from '../shared/result.js';

describe('isFormatAllowedForSurface', () => {
  // Encodes the rule:
  //   Indoor → sixes | quads
  //   Grass  → sixes | quads | triples | doubles
  //   Sand   → sixes | quads | triples | doubles
  const cases: Array<[Surface, Format, boolean]> = [
    [Surface.Indoor, Format.Sixes, true],
    [Surface.Indoor, Format.Quads, true],
    [Surface.Indoor, Format.Triples, false],
    [Surface.Indoor, Format.Doubles, false],
    [Surface.Grass, Format.Sixes, true],
    [Surface.Grass, Format.Quads, true],
    [Surface.Grass, Format.Triples, true],
    [Surface.Grass, Format.Doubles, true],
    [Surface.Sand, Format.Sixes, true],
    [Surface.Sand, Format.Quads, true],
    [Surface.Sand, Format.Triples, true],
    [Surface.Sand, Format.Doubles, true],
  ];

  it.each(cases)('%s + %s → %s', (surface, format, expected) => {
    expect(isFormatAllowedForSurface(surface, format)).toBe(expected);
  });

  it('assertFormatAllowedForSurface throws InvariantViolation for invalid combos', () => {
    expect(() => assertFormatAllowedForSurface(Surface.Indoor, Format.Doubles)).toThrow(
      InvariantViolation,
    );
  });

  it('assertFormatAllowedForSurface is a no-op for valid combos', () => {
    expect(() => assertFormatAllowedForSurface(Surface.Sand, Format.Doubles)).not.toThrow();
  });
});

describe('playersPerSide', () => {
  it('returns canonical player counts', () => {
    expect(playersPerSide(Format.Sixes)).toBe(6);
    expect(playersPerSide(Format.Quads)).toBe(4);
    expect(playersPerSide(Format.Triples)).toBe(3);
    expect(playersPerSide(Format.Doubles)).toBe(2);
  });
});
