import { describe, it, expect } from 'vitest';
import { parseTeams, roundRobin, gameCount, formatScheduleText, type Round } from './schedule.js';

const teamsInRound = (round: Round): string[] => round.matches.flatMap((m) => [m.home, m.away]);

const pairKey = (a: string, b: string) => [a, b].sort().join('|');

const allPairs = (rounds: Round[]): string[] =>
  rounds.flatMap((r) => r.matches.map((m) => pairKey(m.home, m.away)));

describe('parseTeams', () => {
  it('trims lines and drops blanks', () => {
    expect(parseTeams('Sharks\n\n  Jets  \nRaptors\n')).toEqual(['Sharks', 'Jets', 'Raptors']);
  });
});

describe('roundRobin — even team count', () => {
  const teams = ['A', 'B', 'C', 'D'];
  const rounds = roundRobin(teams);

  it('produces n-1 rounds of n/2 matches', () => {
    expect(rounds).toHaveLength(3);
    expect(rounds.every((r) => r.matches.length === 2)).toBe(true);
  });

  it('pairs every team with every other exactly once', () => {
    const pairs = allPairs(rounds);
    expect(pairs).toHaveLength(6); // C(4,2)
    expect(new Set(pairs).size).toBe(6);
  });

  it('never schedules a team twice in the same round', () => {
    for (const round of rounds) {
      const names = teamsInRound(round);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('roundRobin — odd team count (byes)', () => {
  const teams = ['A', 'B', 'C'];
  const rounds = roundRobin(teams);

  it('gives one match per round and never surfaces the bye sentinel', () => {
    expect(rounds).toHaveLength(3);
    expect(rounds.every((r) => r.matches.length === 1)).toBe(true);
    expect(allPairs(rounds).join(' ')).not.toContain('bye');
  });

  it('sits each team out exactly once', () => {
    const appearances = (team: string) =>
      rounds.filter((r) => teamsInRound(r).includes(team)).length;
    expect(['A', 'B', 'C'].map(appearances)).toEqual([2, 2, 2]);
  });

  it('still covers all unique pairs once', () => {
    const pairs = allPairs(rounds);
    expect(pairs).toHaveLength(3); // C(3,2)
    expect(new Set(pairs).size).toBe(3);
  });
});

describe('roundRobin — courts', () => {
  it('deals each round across the available courts', () => {
    const rounds = roundRobin(['A', 'B', 'C', 'D'], 2);
    for (const round of rounds) {
      expect(round.matches.map((m) => m.court)).toEqual([1, 2]);
    }
  });

  it('omits court numbers entirely with a single court', () => {
    const rounds = roundRobin(['A', 'B', 'C', 'D'], 1);
    expect(rounds.flatMap((r) => r.matches).every((m) => m.court === undefined)).toBe(true);
  });
});

describe('roundRobin — degenerate input', () => {
  it('returns no rounds for fewer than two teams', () => {
    expect(roundRobin([])).toEqual([]);
    expect(roundRobin(['Solo'])).toEqual([]);
  });
});

describe('gameCount', () => {
  it('sums matches across rounds', () => {
    expect(gameCount(roundRobin(['A', 'B', 'C', 'D']))).toBe(6);
  });
});

describe('formatScheduleText', () => {
  it('numbers rounds and appends court labels when present', () => {
    const text = formatScheduleText([
      { matches: [{ home: 'A', away: 'B', court: 1 }] },
      { matches: [{ home: 'A', away: 'C' }] },
    ]);
    expect(text).toBe('Round 1\n- A vs B (Court 1)\n\nRound 2\n- A vs C');
  });
});
