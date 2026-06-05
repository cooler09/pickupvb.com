import { describe, it, expect } from 'vitest';
import { parseRoster, hasRatings, shuffle, snakeDistribute } from './roster.js';

// A constant rng makes the shuffle deterministic. `() => 0` maps Fisher-Yates
// to a fixed permutation — enough to assert the permutation/no-mutation
// invariants, which must hold for any rng.
const fixedRng = () => 0;

describe('parseRoster', () => {
  it('parses one name per line and drops blanks', () => {
    expect(parseRoster('Alex\n\n  Bo  \nCara\n')).toEqual([
      { name: 'Alex' },
      { name: 'Bo' },
      { name: 'Cara' },
    ]);
  });

  it('parses a trailing number after whitespace, comma, or colon', () => {
    expect(parseRoster('Alex 5\nBo, 3\nCara: 4.5')).toEqual([
      { name: 'Alex', rating: 5 },
      { name: 'Bo', rating: 3 },
      { name: 'Cara', rating: 4.5 },
    ]);
  });

  it('keeps a multi-word name and treats a name without a trailing number as bare', () => {
    expect(parseRoster('Mary Jane\nAl Smith 8')).toEqual([
      { name: 'Mary Jane' },
      { name: 'Al Smith', rating: 8 },
    ]);
  });
});

describe('hasRatings', () => {
  it('is true only when at least one player has a number', () => {
    expect(hasRatings([{ name: 'A' }, { name: 'B' }])).toBe(false);
    expect(hasRatings([{ name: 'A' }, { name: 'B', rating: 2 }])).toBe(true);
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, fixedRng);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('snakeDistribute', () => {
  it('deals in a snake so the turn bucket takes two in a row', () => {
    expect(snakeDistribute([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 6],
      [2, 5],
      [3, 4],
    ]);
  });

  it('keeps bucket sizes within one of each other', () => {
    const sizes = snakeDistribute([1, 2, 3, 4, 5, 6, 7], 3)
      .map((b) => b.length)
      .sort();
    expect(sizes).toEqual([2, 2, 3]);
  });

  it('clamps a sub-1 bucket count to a single bucket', () => {
    expect(snakeDistribute([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });

  it('returns empty buckets when there are no items', () => {
    expect(snakeDistribute([], 2)).toEqual([[], []]);
  });
});
