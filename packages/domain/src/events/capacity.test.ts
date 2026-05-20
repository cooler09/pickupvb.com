import { describe, it, expect } from 'vitest';
import { Capacity } from './capacity.js';
import { InvariantViolation } from '../shared/result.js';

describe('Capacity', () => {
  describe('fixed', () => {
    it('accepts positive integers', () => {
      const c = Capacity.fixed(12);
      expect(c.kind).toBe('fixed');
      expect(c.maxSpots).toBe(12);
    });

    it('rejects zero', () => {
      expect(() => Capacity.fixed(0)).toThrow(InvariantViolation);
    });

    it('rejects negatives', () => {
      expect(() => Capacity.fixed(-3)).toThrow(InvariantViolation);
    });

    it('rejects non-integers', () => {
      expect(() => Capacity.fixed(1.5)).toThrow(InvariantViolation);
    });

    it('rejects NaN', () => {
      expect(() => Capacity.fixed(NaN)).toThrow(InvariantViolation);
    });
  });

  describe('unlimited', () => {
    it('always has room, regardless of fill', () => {
      const c = Capacity.unlimited();
      expect(c.hasRoom(0)).toBe(true);
      expect(c.hasRoom(1_000_000)).toBe(true);
    });

    it('exposes null maxSpots', () => {
      expect(Capacity.unlimited().maxSpots).toBeNull();
    });
  });

  describe('hasRoom (fixed)', () => {
    it('returns true under the cap', () => {
      expect(Capacity.fixed(10).hasRoom(0)).toBe(true);
      expect(Capacity.fixed(10).hasRoom(9)).toBe(true);
    });

    it('returns false at the cap', () => {
      expect(Capacity.fixed(10).hasRoom(10)).toBe(false);
    });

    it('returns false over the cap', () => {
      expect(Capacity.fixed(10).hasRoom(11)).toBe(false);
    });
  });
});
