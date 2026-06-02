import { describe, it, expect } from 'vitest';
import {
  parseRoster,
  hasRatings,
  shuffle,
  splitTeams,
  teamSummary,
  formatTeamsText,
  type Player,
} from './split.js';

// A constant rng makes the shuffle deterministic. `() => 0` maps Fisher-Yates
// to a fixed permutation, which is all these tests need — the split invariants
// (every player placed exactly once, even sizes, level totals) must hold for
// *any* permutation, so pinning one is enough to assert them.
const fixedRng = () => 0;

const names = (players: Player[]) => players.map((p) => p.name).sort();

describe('parseRoster', () => {
  it('parses one name per line and drops blanks', () => {
    expect(parseRoster('Alex\n\n  Bo  \nCara\n')).toEqual([
      { name: 'Alex' },
      { name: 'Bo' },
      { name: 'Cara' },
    ]);
  });

  it('parses a trailing skill rating after whitespace, comma, or colon', () => {
    expect(parseRoster('Alex 5\nBo, 3\nCara: 4.5')).toEqual([
      { name: 'Alex', rating: 5 },
      { name: 'Bo', rating: 3 },
      { name: 'Cara', rating: 4.5 },
    ]);
  });

  it('keeps a multi-word name and treats a name without a trailing number as rating-free', () => {
    expect(parseRoster('Mary Jane\nAl Smith 8')).toEqual([
      { name: 'Mary Jane' },
      { name: 'Al Smith', rating: 8 },
    ]);
  });
});

describe('hasRatings', () => {
  it('is true only when at least one player has a rating', () => {
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

describe('splitTeams — random', () => {
  it('places every player exactly once across N teams', () => {
    const players: Player[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name) => ({ name }));
    const teams = splitTeams(players, 3, 'random', fixedRng);
    expect(teams).toHaveLength(3);
    expect(names(teams.flatMap((t) => t.players))).toEqual(names(players));
  });

  it('keeps team sizes within one of each other', () => {
    const players: Player[] = Array.from({ length: 7 }, (_, i) => ({ name: `P${i}` }));
    const sizes = splitTeams(players, 3, 'random', fixedRng)
      .map((t) => t.players.length)
      .sort();
    expect(sizes).toEqual([2, 2, 3]);
  });
});

describe('splitTeams — balanced', () => {
  it('snake-drafts distinct ratings into level totals', () => {
    const players: Player[] = [10, 9, 8, 7, 6, 5].map((rating, i) => ({ name: `P${i}`, rating }));
    const teams = splitTeams(players, 3, 'balanced', fixedRng);
    expect(teams.map((t) => teamSummary(t).total)).toEqual([15, 15, 15]);
    expect(teams.map((t) => t.players.length)).toEqual([2, 2, 2]);
  });

  it('treats unrated players as the mean of the rated ones', () => {
    const players: Player[] = [{ name: 'A', rating: 4 }, { name: 'B', rating: 2 }, { name: 'C' }];
    const teams = splitTeams(players, 3, 'balanced', fixedRng);
    // Every player still placed exactly once, regardless of the mean fill-in.
    expect(names(teams.flatMap((t) => t.players))).toEqual(['A', 'B', 'C']);
  });
});

describe('splitTeams — clamping', () => {
  it('coerces a sub-1 team count to a single team', () => {
    const teams = splitTeams([{ name: 'A' }, { name: 'B' }], 0, 'random', fixedRng);
    expect(teams).toHaveLength(1);
    expect(teams[0]?.players).toHaveLength(2);
  });
});

describe('teamSummary', () => {
  it('reports a null average when no player is rated', () => {
    expect(teamSummary({ players: [{ name: 'A' }, { name: 'B' }] })).toEqual({
      count: 2,
      total: 0,
      avg: null,
    });
  });

  it('averages only the rated players', () => {
    expect(
      teamSummary({
        players: [
          { name: 'A', rating: 6 },
          { name: 'B', rating: 2 },
        ],
      }),
    ).toEqual({
      count: 2,
      total: 8,
      avg: 4,
    });
  });
});

describe('formatTeamsText', () => {
  it('renders numbered teams with ratings in parentheses', () => {
    const text = formatTeamsText([
      { players: [{ name: 'A', rating: 5 }, { name: 'B' }] },
      { players: [{ name: 'C' }] },
    ]);
    expect(text).toBe('Team 1\n- A (5)\n- B\n\nTeam 2\n- C');
  });
});
