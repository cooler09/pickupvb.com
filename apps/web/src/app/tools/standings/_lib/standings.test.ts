import { describe, it, expect } from 'vitest';
import {
  createStandingsState,
  addTeams,
  removeTeam,
  recordResult,
  removeResult,
  computeStandings,
  formatStandingsText,
  type StandingsState,
} from './standings.js';

const T0 = 1_000_000;

const withTeams = (...names: string[]): StandingsState =>
  addTeams(createStandingsState(T0), names, T0);

/** Record a series of `[home, away, hs, as]` games onto a state. */
const play = (state: StandingsState, games: [string, string, number, number][]): StandingsState =>
  games.reduce(
    (s, [home, away, homeScore, awayScore]) =>
      recordResult(s, { home, away, homeScore, awayScore }, T0),
    state,
  );

const order = (state: StandingsState) => computeStandings(state).map((r) => r.name);

describe('addTeams', () => {
  it('dedupes against existing teams and within the batch, dropping blanks', () => {
    const s = addTeams(withTeams('A'), ['A', 'B', 'B', '  ', 'C'], T0);
    expect(s.teams).toEqual(['A', 'B', 'C']);
  });
});

describe('recordResult', () => {
  it('appends a valid game', () => {
    const s = play(withTeams('A', 'B'), [['A', 'B', 25, 20]]);
    expect(s.results).toHaveLength(1);
  });

  it('ignores a game with an unknown team or a team playing itself', () => {
    const base = withTeams('A', 'B');
    expect(recordResult(base, { home: 'A', away: 'Z', homeScore: 25, awayScore: 1 }, T0)).toBe(
      base,
    );
    expect(recordResult(base, { home: 'A', away: 'A', homeScore: 25, awayScore: 1 }, T0)).toBe(
      base,
    );
  });
});

describe('removeTeam / removeResult', () => {
  it('drops a team and every game it appears in', () => {
    const s = removeTeam(
      play(withTeams('A', 'B', 'C'), [
        ['A', 'B', 25, 10],
        ['B', 'C', 25, 10],
      ]),
      'B',
      T0,
    );
    expect(s.teams).toEqual(['A', 'C']);
    expect(s.results).toHaveLength(0);
  });

  it('undoes a single recorded result', () => {
    const s = play(withTeams('A', 'B'), [
      ['A', 'B', 25, 10],
      ['B', 'A', 25, 10],
    ]);
    expect(removeResult(s, 0, T0).results).toHaveLength(1);
  });
});

describe('computeStandings — tallies', () => {
  it('counts W/L and points for/against/diff', () => {
    const rows = computeStandings(play(withTeams('A', 'B'), [['A', 'B', 25, 18]]));
    const a = rows.find((r) => r.name === 'A')!;
    const b = rows.find((r) => r.name === 'B')!;
    expect(a).toMatchObject({
      wins: 1,
      losses: 0,
      pointsFor: 25,
      pointsAgainst: 18,
      diff: 7,
      rank: 1,
    });
    expect(b).toMatchObject({ wins: 0, losses: 1, diff: -7, rank: 2 });
  });
});

describe('computeStandings — tiebreakers', () => {
  it('breaks a tie on head-to-head before point differential', () => {
    // A and B both finish 2-1; A beat B head-to-head, so A ranks above B
    // regardless of differential. C and D finish 1-2 (C beat D).
    const s = play(withTeams('A', 'B', 'C', 'D'), [
      ['A', 'B', 25, 23], // A beats B (the head-to-head)
      ['A', 'C', 25, 10],
      ['D', 'A', 25, 10], // A loses to D
      ['B', 'C', 25, 10],
      ['B', 'D', 25, 10],
      ['C', 'D', 25, 10],
    ]);
    const rows = computeStandings(s);
    expect(rows.map((r) => `${r.name}:${r.wins}-${r.losses}`)).toEqual([
      'A:2-1',
      'B:2-1',
      'C:1-2',
      'D:1-2',
    ]);
  });

  it('falls back to point differential when teams never met (or split)', () => {
    // A and B both 2-0 but never played each other → head-to-head is even,
    // so the larger differential wins.
    const s = play(withTeams('A', 'B', 'C', 'D'), [
      ['A', 'C', 25, 5], // A diff +20 so far
      ['A', 'D', 25, 5],
      ['B', 'C', 25, 18], // B diff +7 so far
      ['B', 'D', 25, 18],
    ]);
    expect(order(s).slice(0, 2)).toEqual(['A', 'B']);
  });
});

describe('formatStandingsText', () => {
  it('renders rank, record, and signed differential', () => {
    const rows = computeStandings(play(withTeams('A', 'B'), [['A', 'B', 25, 18]]));
    expect(formatStandingsText(rows)).toBe('1. A  1-0  (+7)\n2. B  0-1  (-7)');
  });
});
