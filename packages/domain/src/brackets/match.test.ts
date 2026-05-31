import { describe, expect, it } from 'vitest';
import { determineWinner, type MatchSet } from './match.js';

// `determineWinner` is the best-of-N match-decision math (untested before —
// architecture audit P3-4). It's generic: each set is won by the higher score,
// and the match is decided once a side reaches the majority `floor(bestOf/2)+1`.

function sets(...pairs: Array<[number, number]>): MatchSet[] {
  return pairs.map(([a, b], i) => ({ setNumber: i + 1, teamAScore: a, teamBScore: b }));
}

describe('determineWinner', () => {
  it('returns the side that reaches the best-of-3 majority (2)', () => {
    expect(determineWinner(sets([25, 20], [25, 18]), 'A', 'B', 3)).toBe('A');
  });

  it('handles a split decided in the deciding set', () => {
    expect(determineWinner(sets([25, 20], [18, 25], [15, 12]), 'A', 'B', 3)).toBe('A');
    expect(determineWinner(sets([20, 25], [25, 18], [12, 15]), 'A', 'B', 3)).toBe('B');
  });

  it('returns null until a side clinches', () => {
    expect(determineWinner(sets([25, 20]), 'A', 'B', 3)).toBeNull(); // 1-0, not enough
    expect(determineWinner(sets([25, 20], [18, 25]), 'A', 'B', 3)).toBeNull(); // 1-1
  });

  it('decides a best-of-1 on the first set', () => {
    expect(determineWinner(sets([25, 23]), 'A', 'B', 1)).toBe('A');
  });

  it('stops at the majority even if extra sets are present', () => {
    // A wins the first 3 of a best-of-5; the 4th/5th are noise.
    expect(determineWinner(sets([25, 0], [25, 0], [25, 0], [0, 25], [0, 25]), 'A', 'B', 5)).toBe(
      'A',
    );
  });

  it('treats a tied set as invalid (returns null)', () => {
    expect(determineWinner(sets([25, 25]), 'A', 'B', 1)).toBeNull();
    expect(determineWinner(sets([25, 10], [25, 25]), 'A', 'B', 3)).toBeNull();
  });

  it('returns null when a participant id or the set list is missing', () => {
    expect(determineWinner(sets([25, 10]), null, 'B', 1)).toBeNull();
    expect(determineWinner(sets([25, 10]), 'A', null, 1)).toBeNull();
    expect(determineWinner([], 'A', 'B', 3)).toBeNull();
  });
});
