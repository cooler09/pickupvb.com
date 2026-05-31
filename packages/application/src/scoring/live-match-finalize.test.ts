import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIVE_MATCH_CONFIG,
  createLiveMatchScore,
  type LiveMatchScore,
} from '@pickupvb/domain';
import { liveMatchScoreToLeagueScore, liveMatchScoreToMatchSets } from './live-match-finalize.js';

function score(over: Partial<LiveMatchScore> = {}): LiveMatchScore {
  return {
    ...createLiveMatchScore({ ...DEFAULT_LIVE_MATCH_CONFIG }, 0),
    ...over,
  };
}

describe('liveMatchScoreToMatchSets (bracket)', () => {
  it('maps completed sets in order with 1-indexed set numbers', () => {
    const s = score({
      setHistory: [
        { a: 25, b: 20 },
        { a: 23, b: 25 },
        { a: 15, b: 12 },
      ],
    });
    expect(liveMatchScoreToMatchSets(s)).toEqual([
      { setNumber: 1, teamAScore: 25, teamBScore: 20 },
      { setNumber: 2, teamAScore: 23, teamBScore: 25 },
      { setNumber: 3, teamAScore: 15, teamBScore: 12 },
    ]);
  });

  it('appends the current set when it has points (save mid-set)', () => {
    const s = score({ setHistory: [{ a: 25, b: 20 }], scoreA: 18, scoreB: 16 });
    expect(liveMatchScoreToMatchSets(s)).toEqual([
      { setNumber: 1, teamAScore: 25, teamBScore: 20 },
      { setNumber: 2, teamAScore: 18, teamBScore: 16 },
    ]);
  });

  it('ignores a 0–0 current set (save after the deciding commitSet)', () => {
    const s = score({ setHistory: [{ a: 25, b: 20 }], scoreA: 0, scoreB: 0 });
    expect(liveMatchScoreToMatchSets(s)).toHaveLength(1);
  });

  it('returns an empty list when nothing has been played', () => {
    expect(liveMatchScoreToMatchSets(score())).toEqual([]);
  });
});

describe('liveMatchScoreToLeagueScore (adaptive)', () => {
  it('best-of-1: uses the committed set points', () => {
    const s = score({
      config: { ...DEFAULT_LIVE_MATCH_CONFIG, bestOf: 1 },
      setHistory: [{ a: 25, b: 21 }],
    });
    expect(liveMatchScoreToLeagueScore(s)).toEqual({ home: 25, away: 21 });
  });

  it('best-of-1: falls back to the current in-progress points when not yet committed', () => {
    const s = score({
      config: { ...DEFAULT_LIVE_MATCH_CONFIG, bestOf: 1 },
      scoreA: 24,
      scoreB: 19,
    });
    expect(liveMatchScoreToLeagueScore(s)).toEqual({ home: 24, away: 19 });
  });

  it('multi-set: uses sets won', () => {
    const s = score({ config: { ...DEFAULT_LIVE_MATCH_CONFIG, bestOf: 3 }, setsA: 2, setsB: 1 });
    expect(liveMatchScoreToLeagueScore(s)).toEqual({ home: 2, away: 1 });
  });
});
