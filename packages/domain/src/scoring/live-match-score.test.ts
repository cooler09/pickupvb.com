import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIVE_MATCH_CONFIG,
  commitSet,
  createLiveMatchScore,
  increment,
  isSetWon,
  matchWinner,
  resetMatch,
  setsToWin,
  swapSides,
  undoLastSet,
  type LiveMatchConfig,
  type LiveMatchScore,
} from './live-match-score.js';

const config = (over: Partial<LiveMatchConfig> = {}): LiveMatchConfig => ({
  ...DEFAULT_LIVE_MATCH_CONFIG,
  ...over,
});

// Pin `now` so version/updatedAt assertions are deterministic.
const T0 = 1_000;
const T1 = 2_000;

describe('createLiveMatchScore', () => {
  it('starts at 0-0, no sets, version 0', () => {
    const s = createLiveMatchScore(config(), T0);
    expect(s).toMatchObject({
      scoreA: 0,
      scoreB: 0,
      setsA: 0,
      setsB: 0,
      setHistory: [],
      version: 0,
      updatedAt: T0,
    });
  });
});

describe('setsToWin', () => {
  it('is the majority of best-of-N', () => {
    expect(setsToWin(1)).toBe(1);
    expect(setsToWin(3)).toBe(2);
    expect(setsToWin(5)).toBe(3);
  });
});

describe('increment', () => {
  it('adds a point to the chosen side and bumps version + updatedAt', () => {
    const s = createLiveMatchScore(config(), T0);
    const next = increment(s, 'A', 1, T1);
    expect(next.scoreA).toBe(1);
    expect(next.scoreB).toBe(0);
    expect(next.version).toBe(1);
    expect(next.updatedAt).toBe(T1);
  });

  it('floors a score at 0 so −1 never goes negative', () => {
    const s = createLiveMatchScore(config(), T0);
    expect(increment(s, 'B', -1, T1).scoreB).toBe(0);
  });

  it('does not mutate the input state', () => {
    const s = createLiveMatchScore(config(), T0);
    increment(s, 'A', 1, T1);
    expect(s.scoreA).toBe(0);
    expect(s.version).toBe(0);
  });
});

describe('isSetWon', () => {
  it('requires reaching the target', () => {
    const s = {
      ...createLiveMatchScore(config({ targetScore: 25, winBy: 2 })),
      scoreA: 24,
      scoreB: 0,
    };
    expect(isSetWon(s, 'A')).toBe(false);
  });

  it('requires the win-by margin (deuce keeps the set alive)', () => {
    const base = createLiveMatchScore(config({ targetScore: 25, winBy: 2 }));
    expect(isSetWon({ ...base, scoreA: 25, scoreB: 24 }, 'A')).toBe(false);
    expect(isSetWon({ ...base, scoreA: 26, scoreB: 24 }, 'A')).toBe(true);
  });

  it('clinches at exactly target when ahead by win-by', () => {
    const base = createLiveMatchScore(config({ targetScore: 25, winBy: 2 }));
    expect(isSetWon({ ...base, scoreA: 25, scoreB: 23 }, 'A')).toBe(true);
  });
});

describe('commitSet', () => {
  it('moves the current points into history, increments the set count, and zeroes the score', () => {
    const s = { ...createLiveMatchScore(config(), T0), scoreA: 25, scoreB: 20 };
    const next = commitSet(s, 'A', T1);
    expect(next.setsA).toBe(1);
    expect(next.setsB).toBe(0);
    expect(next.setHistory).toEqual([{ a: 25, b: 20 }]);
    expect(next.scoreA).toBe(0);
    expect(next.scoreB).toBe(0);
    expect(next.version).toBe(1);
    expect(next.updatedAt).toBe(T1);
  });
});

describe('undoLastSet', () => {
  it('reverses the deciding commitSet so an accidental match win is no longer decided', () => {
    // best-of-1: a single committed set ends the match. Undo must drop the
    // match back into that set at its final score so the scorer can correct it.
    const decided: LiveMatchScore = {
      ...createLiveMatchScore(config({ bestOf: 1 }), T0),
      setsA: 1,
      setHistory: [{ a: 25, b: 23 }],
    };
    expect(matchWinner(decided)).toBe('A');
    const next = undoLastSet(decided, T1);
    expect(matchWinner(next)).toBeNull();
    expect(next.setsA).toBe(0);
    expect(next.setHistory).toEqual([]);
    expect(next.scoreA).toBe(25);
    expect(next.scoreB).toBe(23);
    expect(next.version).toBe(1);
    expect(next.updatedAt).toBe(T1);
  });

  it('decrements the side that actually won the popped set (inferred from the score)', () => {
    const s: LiveMatchScore = {
      ...createLiveMatchScore(config({ bestOf: 3 })),
      setsA: 1,
      setsB: 1,
      setHistory: [
        { a: 25, b: 20 },
        { a: 22, b: 25 },
      ],
    };
    const next = undoLastSet(s, T1);
    expect(next.setsA).toBe(1);
    expect(next.setsB).toBe(0);
    expect(next.setHistory).toEqual([{ a: 25, b: 20 }]);
    expect(next.scoreA).toBe(22);
    expect(next.scoreB).toBe(25);
  });

  it('is a no-op when no set has been played', () => {
    const s = createLiveMatchScore(config(), T0);
    expect(undoLastSet(s, T1)).toBe(s);
  });

  it('does not mutate the input state', () => {
    const s: LiveMatchScore = {
      ...createLiveMatchScore(config(), T0),
      setsA: 1,
      setHistory: [{ a: 25, b: 23 }],
    };
    undoLastSet(s, T1);
    expect(s.setsA).toBe(1);
    expect(s.setHistory).toEqual([{ a: 25, b: 23 }]);
  });
});

describe('matchWinner', () => {
  it('returns null until a side reaches the sets-to-win threshold', () => {
    const s: LiveMatchScore = {
      ...createLiveMatchScore(config({ bestOf: 3 })),
      setsA: 1,
      setsB: 1,
    };
    expect(matchWinner(s)).toBeNull();
  });

  it('declares the side that clinches the majority of sets', () => {
    const s: LiveMatchScore = {
      ...createLiveMatchScore(config({ bestOf: 3 })),
      setsA: 2,
      setsB: 1,
    };
    expect(matchWinner(s)).toBe('A');
  });

  it('treats best-of-1 as first-to-one-set', () => {
    const s: LiveMatchScore = { ...createLiveMatchScore(config({ bestOf: 1 })), setsB: 1 };
    expect(matchWinner(s)).toBe('B');
  });
});

describe('resetMatch', () => {
  it('clears scores/sets/history but carries the config and advances the version', () => {
    const next = resetMatch(config({ teamA: 'Spikers' }), 7, T1);
    expect(next.config.teamA).toBe('Spikers');
    expect(next.scoreA).toBe(0);
    expect(next.setsA).toBe(0);
    expect(next.setHistory).toEqual([]);
    // Bumps past the prior version so peers adopt the reset over a stale snapshot.
    expect(next.version).toBe(8);
    expect(next.updatedAt).toBe(T1);
  });
});

describe('swapSides', () => {
  it('mirrors names, scores, sets, and history across the two columns', () => {
    const s: LiveMatchScore = {
      ...createLiveMatchScore(config({ teamA: 'A', teamB: 'B' }), T0),
      scoreA: 10,
      scoreB: 4,
      setsA: 1,
      setsB: 0,
      setHistory: [{ a: 25, b: 20 }],
    };
    const next = swapSides(s, T1);
    expect(next.config.teamA).toBe('B');
    expect(next.config.teamB).toBe('A');
    expect(next.scoreA).toBe(4);
    expect(next.scoreB).toBe(10);
    expect(next.setsA).toBe(0);
    expect(next.setsB).toBe(1);
    expect(next.setHistory).toEqual([{ a: 20, b: 25 }]);
    expect(next.version).toBe(1);
  });
});
