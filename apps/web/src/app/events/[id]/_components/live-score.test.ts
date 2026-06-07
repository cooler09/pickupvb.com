import { describe, expect, it } from 'vitest';
import type { LiveMatchConfig, LiveMatchScore } from '@pickupvb/domain';
import { liveGames } from './live-score';

/**
 * `liveGames` is the read-side projection that turns the match-keyed live state
 * into a per-game scoreline — the heart of "a best-of-3 tracks 3 games, not one
 * match-level number". These tests pin that mapping and its one non-obvious
 * edge: never render a phantom column once the match has been clinched.
 */

function mk(p: {
  config?: Partial<LiveMatchConfig>;
  scoreA?: number;
  scoreB?: number;
  setsA?: number;
  setsB?: number;
  setHistory?: ReadonlyArray<{ a: number; b: number }>;
}): LiveMatchScore {
  return {
    config: { teamA: 'Aces', teamB: 'Spikers', targetScore: 25, winBy: 2, bestOf: 3, ...p.config },
    scoreA: p.scoreA ?? 0,
    scoreB: p.scoreB ?? 0,
    setsA: p.setsA ?? 0,
    setsB: p.setsB ?? 0,
    setHistory: p.setHistory ?? [],
    version: 0,
    updatedAt: 0,
  };
}

describe('liveGames', () => {
  it('best-of-3 mid game 3: finished games + the live game (3 columns)', () => {
    const games = liveGames(
      mk({
        setHistory: [
          { a: 25, b: 20 },
          { a: 18, b: 25 },
        ],
        setsA: 1,
        setsB: 1,
        scoreA: 12,
        scoreB: 9,
      }),
    );
    expect(games.map((g) => g.n)).toEqual([1, 2, 3]);
    expect(games[0]).toMatchObject({ a: 25, b: 20, live: false, winner: 'A' });
    expect(games[1]).toMatchObject({ a: 18, b: 25, live: false, winner: 'B' });
    expect(games[2]).toMatchObject({ a: 12, b: 9, live: true, winner: null });
  });

  it('does not append a phantom game once the match is decided (2–0)', () => {
    const games = liveGames(
      mk({
        setHistory: [
          { a: 25, b: 20 },
          { a: 25, b: 18 },
        ],
        setsA: 2,
        setsB: 0,
      }),
    );
    expect(games).toHaveLength(2);
    expect(games.every((g) => !g.live)).toBe(true);
  });

  it('best-of-1: a single live game from the current rally', () => {
    const games = liveGames(mk({ config: { bestOf: 1 }, scoreA: 15, scoreB: 12 }));
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ n: 1, a: 15, b: 12, live: true });
  });

  it('fresh match: one live game at 0–0', () => {
    const games = liveGames(mk({}));
    expect(games).toEqual([{ n: 1, a: 0, b: 0, live: true, winner: null }]);
  });

  it('a tied finished game has no winner', () => {
    const games = liveGames(mk({ setHistory: [{ a: 24, b: 24 }], setsA: 0, setsB: 0 }));
    expect(games[0]).toMatchObject({ n: 1, winner: null, live: false });
  });
});
