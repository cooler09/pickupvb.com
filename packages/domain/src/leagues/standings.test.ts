import { describe, expect, it } from 'vitest';
import { computeLeagueStandings, type LeagueMatchResult } from './standings.js';
import { LeagueMatchStatus } from './league-schedule.js';
import { EntryId } from '../brackets/match.js';

// `computeLeagueStandings` is the league regular-season scoring math (wins /
// point diff + the tiebreak sort) over the single-score-per-match shape of
// `league_schedule_matches`. These cases pin the tally + ordering rules and
// the "register but don't score" handling of non-terminal / unscored matches.

function result(over: Partial<LeagueMatchResult>): LeagueMatchResult {
  return {
    homeEntryId: null,
    awayEntryId: null,
    homeScore: null,
    awayScore: null,
    status: LeagueMatchStatus.Scheduled,
    ...over,
  };
}

function played(
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  status: LeagueMatchStatus = LeagueMatchStatus.Completed,
): LeagueMatchResult {
  return result({
    homeEntryId: EntryId(home),
    awayEntryId: EntryId(away),
    homeScore,
    awayScore,
    status,
  });
}

describe('computeLeagueStandings', () => {
  it('tallies a win, a loss, and points for a completed match', () => {
    const standings = computeLeagueStandings([played('A', 'B', 25, 20)]);

    const a = standings.find((s) => String(s.entryId) === 'A')!;
    const b = standings.find((s) => String(s.entryId) === 'B')!;
    expect(a).toMatchObject({
      matchesPlayed: 1,
      wins: 1,
      losses: 0,
      pointsFor: 25,
      pointsAgainst: 20,
      pointDiff: 5,
    });
    expect(b).toMatchObject({
      matchesPlayed: 1,
      wins: 0,
      losses: 1,
      pointsFor: 20,
      pointsAgainst: 25,
      pointDiff: -5,
    });
    // Winner sorts first.
    expect(String(standings[0]?.entryId)).toBe('A');
  });

  it('awards the win to the away team when it outscores home', () => {
    const standings = computeLeagueStandings([played('A', 'B', 1, 2)]);
    expect(standings.find((s) => String(s.entryId) === 'B')!.wins).toBe(1);
    expect(standings.find((s) => String(s.entryId) === 'A')!.losses).toBe(1);
  });

  it('registers teams from a scheduled match with zeroed stats', () => {
    const standings = computeLeagueStandings([
      result({ homeEntryId: EntryId('A'), awayEntryId: EntryId('B') }),
    ]);
    expect(standings).toHaveLength(2);
    expect(standings.every((s) => s.matchesPlayed === 0 && s.wins === 0)).toBe(true);
  });

  it('counts a forfeit that has a recorded score', () => {
    const standings = computeLeagueStandings([played('A', 'B', 25, 0, LeagueMatchStatus.Forfeit)]);
    expect(standings.find((s) => String(s.entryId) === 'A')!.wins).toBe(1);
    expect(standings.find((s) => String(s.entryId) === 'B')!.losses).toBe(1);
  });

  it('registers but does not score a completed match missing a score', () => {
    const standings = computeLeagueStandings([
      result({
        homeEntryId: EntryId('A'),
        awayEntryId: EntryId('B'),
        homeScore: 25,
        awayScore: null,
        status: LeagueMatchStatus.Completed,
      }),
    ]);
    expect(standings).toHaveLength(2);
    expect(standings.every((s) => s.matchesPlayed === 0)).toBe(true);
  });

  it('orders by wins, then point differential', () => {
    // Round-robin: X beats Y and Z; Y beats Z. X 2W, Y 1W, Z 0W.
    const standings = computeLeagueStandings([
      played('X', 'Y', 25, 10),
      played('X', 'Z', 25, 12),
      played('Y', 'Z', 25, 20),
    ]);
    expect(standings.map((s) => String(s.entryId))).toEqual(['X', 'Y', 'Z']);
  });

  it('breaks an equal-wins tie by point differential', () => {
    // P and Q each win once; P by +15, Q by +5.
    const standings = computeLeagueStandings([
      played('P', 'x1', 25, 10),
      played('Q', 'x2', 25, 20),
    ]);
    const order = standings
      .filter((s) => ['P', 'Q'].includes(String(s.entryId)))
      .map((s) => String(s.entryId));
    expect(order).toEqual(['P', 'Q']);
  });
});
