import { describe, it, expect } from 'vitest';
import {
  toCents,
  parsePeople,
  splitCost,
  allocationTotal,
  hasUnevenShares,
  formatCents,
  formatCostText,
} from './cost.js';

describe('toCents', () => {
  it('converts dollars to integer cents', () => {
    expect(toCents(120)).toBe(12000);
    expect(toCents(120.5)).toBe(12050);
    expect(toCents(Number.NaN)).toBe(0);
  });
});

describe('parsePeople', () => {
  it('defaults to one share and reads a trailing number as a share weight', () => {
    expect(parsePeople('Alex\nSam 2\nFree 0')).toEqual([
      { name: 'Alex', shares: 1 },
      { name: 'Sam', shares: 2 },
      { name: 'Free', shares: 0 },
    ]);
  });
});

describe('splitCost', () => {
  it('splits evenly when shares are equal', () => {
    const out = splitCost(10000, parsePeople('A\nB\nC\nD'));
    expect(out.map((a) => a.cents)).toEqual([2500, 2500, 2500, 2500]);
  });

  it('always sums back to the exact total, even with an indivisible amount', () => {
    const out = splitCost(10000, parsePeople('A\nB\nC')); // $100 / 3
    expect(allocationTotal(out)).toBe(10000);
    expect(out.map((a) => a.cents)).toEqual([3334, 3333, 3333]);
  });

  it('weights by shares and gives the leftover cent to the largest remainder', () => {
    const out = splitCost(10000, parsePeople('A 2\nB 1')); // 2:1 of $100
    expect(out.map((a) => a.cents)).toEqual([6667, 3333]);
    expect(allocationTotal(out)).toBe(10000);
  });

  it('returns zeros for a zero total and an empty list for no people', () => {
    expect(splitCost(0, parsePeople('A\nB')).map((a) => a.cents)).toEqual([0, 0]);
    expect(splitCost(10000, [])).toEqual([]);
  });
});

describe('hasUnevenShares', () => {
  it('detects a non-default share weight', () => {
    expect(hasUnevenShares(parsePeople('A\nB'))).toBe(false);
    expect(hasUnevenShares(parsePeople('A 2\nB'))).toBe(true);
  });
});

describe('formatting', () => {
  it('formats cents as a dollar string', () => {
    expect(formatCents(3334)).toBe('$33.34');
    expect(formatCents(2500)).toBe('$25.00');
  });

  it('renders one line per person for copy', () => {
    expect(formatCostText([{ name: 'A', shares: 1, cents: 2500 }])).toBe('A: $25.00');
  });
});
