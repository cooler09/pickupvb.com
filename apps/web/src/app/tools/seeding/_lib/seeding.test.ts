import { describe, it, expect } from 'vitest';
import { seedOrder, intoPools, formatSeedsText, poolLabel, type Player } from './seeding.js';

const fixedRng = () => 0;

describe('seedOrder — ranked', () => {
  it('orders by rating descending and numbers from 1', () => {
    const players: Player[] = [
      { name: 'Low', rating: 2 },
      { name: 'High', rating: 9 },
      { name: 'Mid', rating: 5 },
    ];
    expect(seedOrder(players, 'ranked', fixedRng)).toEqual([
      { seed: 1, name: 'High', rating: 9 },
      { seed: 2, name: 'Mid', rating: 5 },
      { seed: 3, name: 'Low', rating: 2 },
    ]);
  });

  it('sinks unrated players below rated ones, keeping input order among them', () => {
    const players: Player[] = [{ name: 'NoneA' }, { name: 'Rated', rating: 3 }, { name: 'NoneB' }];
    expect(seedOrder(players, 'ranked', fixedRng).map((s) => s.name)).toEqual([
      'Rated',
      'NoneA',
      'NoneB',
    ]);
  });
});

describe('seedOrder — random', () => {
  it('seeds every player exactly once', () => {
    const players: Player[] = ['A', 'B', 'C', 'D'].map((name) => ({ name }));
    const seeds = seedOrder(players, 'random', fixedRng);
    expect(seeds.map((s) => s.name).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(seeds.map((s) => s.seed)).toEqual([1, 2, 3, 4]);
  });
});

describe('intoPools', () => {
  it('snakes seeds across pools so each pool gets a top seed', () => {
    const seeds = seedOrder(
      [5, 4, 3, 2].map((rating, i) => ({ name: `P${i}`, rating })),
      'ranked',
      fixedRng,
    );
    // Seeds 1..4 → snake into 2 pools: [1,4] and [2,3].
    expect(intoPools(seeds, 2).map((pool) => pool.map((s) => s.seed))).toEqual([
      [1, 4],
      [2, 3],
    ]);
  });
});

describe('poolLabel', () => {
  it('labels pools A, B, C…', () => {
    expect([0, 1, 2].map(poolLabel)).toEqual(['A', 'B', 'C']);
  });
});

describe('formatSeedsText', () => {
  it('renders a flat numbered list for a single pool', () => {
    const seeds = [
      { seed: 1, name: 'A', rating: 9 },
      { seed: 2, name: 'B' },
    ];
    expect(formatSeedsText([seeds])).toBe('1. A (9)\n2. B');
  });

  it('labels pools when there is more than one', () => {
    expect(formatSeedsText([[{ seed: 1, name: 'A' }], [{ seed: 2, name: 'B' }]])).toBe(
      'Pool A\n1. A\n\nPool B\n2. B',
    );
  });
});
