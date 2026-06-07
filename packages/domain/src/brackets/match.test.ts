import { describe, expect, it } from 'vitest';
import {
  determineWinner,
  effectiveSetTargetScore,
  type Match,
  type MatchSet,
  type MatchTargetDefaults,
} from './match.js';

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

// `effectiveSetTargetScore` resolves the informational "play to" for a specific
// game (ADR 0032) — the per-game extension that lets a best-of-3 read 25 / 25 /
// 15. Precedence: per-match override → playoff array (final) → pool array →
// single-value fallback.
describe('effectiveSetTargetScore', () => {
  const poolMatch = (
    targetScore: number | null = null,
  ): Pick<Match, 'targetScore' | 'bracketSide'> => ({
    targetScore,
    bracketSide: null,
  });
  const finalMatch = (
    targetScore: number | null = null,
  ): Pick<Match, 'targetScore' | 'bracketSide'> => ({
    targetScore,
    bracketSide: 'final',
  });

  it('reads the per-game value for each game (25 / 25 / 15)', () => {
    const d: MatchTargetDefaults = {
      targetScore: null,
      playoffTargetScore: null,
      targetScores: [25, 25, 15],
      playoffTargetScores: null,
    };
    expect(effectiveSetTargetScore(poolMatch(), 1, d)).toBe(25);
    expect(effectiveSetTargetScore(poolMatch(), 2, d)).toBe(25);
    expect(effectiveSetTargetScore(poolMatch(), 3, d)).toBe(15);
  });

  it('clamps a game past the end of the array to the last entry', () => {
    const d: MatchTargetDefaults = {
      targetScore: null,
      playoffTargetScore: null,
      targetScores: [25, 25, 15],
      playoffTargetScores: null,
    };
    // A 4th set (unusual for a bo3) reuses the deciding-game target.
    expect(effectiveSetTargetScore(poolMatch(), 4, d)).toBe(15);
  });

  it('prefers the playoff array for a `final` match, the pool array otherwise', () => {
    const d: MatchTargetDefaults = {
      targetScore: null,
      playoffTargetScore: null,
      targetScores: [21, 21, 15],
      playoffTargetScores: [25, 25, 15],
    };
    expect(effectiveSetTargetScore(finalMatch(), 1, d)).toBe(25); // playoff stage
    expect(effectiveSetTargetScore(poolMatch(), 1, d)).toBe(21); // pool stage
  });

  it('lets a per-match override win for every game', () => {
    const d: MatchTargetDefaults = {
      targetScore: 25,
      playoffTargetScore: null,
      targetScores: [25, 25, 15],
      playoffTargetScores: null,
    };
    // The host pinned this one match to a uniform 18 — applies to all games.
    expect(effectiveSetTargetScore(poolMatch(18), 1, d)).toBe(18);
    expect(effectiveSetTargetScore(poolMatch(18), 3, d)).toBe(18);
  });

  it('falls back to the single-value target when no array is set', () => {
    const d: MatchTargetDefaults = {
      targetScore: 25,
      playoffTargetScore: 15,
      targetScores: null,
      playoffTargetScores: null,
    };
    expect(effectiveSetTargetScore(poolMatch(), 2, d)).toBe(25);
    expect(effectiveSetTargetScore(finalMatch(), 2, d)).toBe(15); // playoff single value
  });
});
