import { describe, it, expect } from 'vitest';
import { splitTeams, teamSummary, formatTeamsText, type Player } from './split.js';

// The roster parse / shuffle primitives are tested in `../../_lib/roster.test.ts`;
// these cover only the team-shaped logic. A constant rng pins one permutation —
// the split invariants (every player placed once, even sizes, level totals) must
// hold for any permutation, so one is enough.
const fixedRng = () => 0;

const names = (players: Player[]) => players.map((p) => p.name).sort();

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
    ).toEqual({ count: 2, total: 8, avg: 4 });
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
