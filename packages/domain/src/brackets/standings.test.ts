import { describe, expect, it } from 'vitest';
import { computePoolStandings, distinctPools } from './standings.js';
import { EntryId, MatchId, type Match, type MatchSet } from './match.js';

// `computePoolStandings` is the pool-play scoring math (wins / set diff /
// point diff + the tiebreak sort). It was untested (architecture audit P3-4,
// "prioritize standings"); these cases pin the tally + ordering rules.

function set(setNumber: number, a: number, b: number): MatchSet {
  return { setNumber, teamAScore: a, teamBScore: b };
}

function match(over: Partial<Match> & { id: string }): Match {
  return {
    round: 1,
    matchNumber: 1,
    pool: 'A',
    bracketSide: null,
    entryAId: null,
    entryBId: null,
    winnerEntryId: null,
    workTeamId: null,
    status: 'pending',
    sets: [],
    court: null,
    slot: null,
    bestOf: null,
    targetScore: null,
    advancesToMatchId: null,
    advancesToSlot: null,
    loserAdvancesToMatchId: null,
    loserAdvancesToSlot: null,
    scheduledAt: null,
    ...over,
    id: MatchId(over.id),
  };
}

/** A completed pool match where `winner` took both sets. */
function completed(
  id: string,
  a: string,
  b: string,
  sets: MatchSet[],
  winner: string,
  pool = 'A',
): Match {
  return match({
    id,
    pool,
    status: 'completed',
    entryAId: EntryId(a),
    entryBId: EntryId(b),
    winnerEntryId: EntryId(winner),
    sets,
  });
}

describe('computePoolStandings', () => {
  it('tallies wins, sets, and points for a completed 2-0 match', () => {
    const matches = [completed('m1', 'A', 'B', [set(1, 25, 20), set(2, 25, 18)], 'A')];
    const standings = computePoolStandings(matches, 'A');

    const a = standings.find((s) => String(s.entryId) === 'A')!;
    const b = standings.find((s) => String(s.entryId) === 'B')!;
    expect(a).toMatchObject({
      matchesPlayed: 1,
      wins: 1,
      losses: 0,
      setsWon: 2,
      setsLost: 0,
      setDiff: 2,
      pointsFor: 50,
      pointsAgainst: 38,
      pointDiff: 12,
    });
    expect(b).toMatchObject({
      matchesPlayed: 1,
      wins: 0,
      losses: 1,
      setsWon: 0,
      setsLost: 2,
      setDiff: -2,
      pointsFor: 38,
      pointsAgainst: 50,
      pointDiff: -12,
    });
    // Winner sorts first.
    expect(String(standings[0]?.entryId)).toBe('A');
  });

  it('only counts matches in the requested pool', () => {
    const matches = [
      completed('m1', 'A', 'B', [set(1, 25, 10)], 'A', 'A'),
      completed('m2', 'C', 'D', [set(1, 25, 10)], 'C', 'B'),
    ];
    const standings = computePoolStandings(matches, 'A');
    expect(standings.map((s) => String(s.entryId)).sort()).toEqual(['A', 'B']);
  });

  it('registers teams from an incomplete match with zeroed stats', () => {
    const matches = [
      match({
        id: 'm1',
        status: 'in_progress',
        entryAId: EntryId('A'),
        entryBId: EntryId('B'),
      }),
    ];
    const standings = computePoolStandings(matches, 'A');
    expect(standings).toHaveLength(2);
    expect(standings.every((s) => s.matchesPlayed === 0 && s.wins === 0)).toBe(true);
  });

  it('skips completed matches missing a participant', () => {
    const matches = [
      match({ id: 'm1', status: 'completed', entryAId: EntryId('A'), entryBId: null }),
    ];
    expect(computePoolStandings(matches, 'A')).toHaveLength(0);
  });

  it('orders by wins, then set differential, then point differential', () => {
    // Three teams, each plays the others once in pool A.
    // X beats Y 2-0, X beats Z 2-0  -> X: 2 wins
    // Y beats Z 2-1                  -> Y: 1 win, Z: 0 wins
    const matches = [
      completed('m1', 'X', 'Y', [set(1, 25, 10), set(2, 25, 10)], 'X'),
      completed('m2', 'X', 'Z', [set(1, 25, 10), set(2, 25, 10)], 'X'),
      completed('m3', 'Y', 'Z', [set(1, 25, 23), set(2, 20, 25), set(3, 15, 13)], 'Y'),
    ];
    const order = computePoolStandings(matches, 'A').map((s) => String(s.entryId));
    expect(order).toEqual(['X', 'Y', 'Z']); // X (2W) > Y (1W) > Z (0W)
  });

  it('breaks an equal-wins tie by set differential', () => {
    // P and Q each win once; P wins 2-0 (setDiff +2), Q wins 2-1 (setDiff +1).
    const matches = [
      completed('m1', 'P', 'x1', [set(1, 25, 10), set(2, 25, 10)], 'P'),
      completed('m2', 'Q', 'x2', [set(1, 25, 10), set(2, 10, 25), set(3, 15, 5)], 'Q'),
    ];
    const order = computePoolStandings(matches, 'A')
      .filter((s) => ['P', 'Q'].includes(String(s.entryId)))
      .map((s) => String(s.entryId));
    expect(order).toEqual(['P', 'Q']);
  });
});

describe('distinctPools', () => {
  it('returns distinct, alphabetically-sorted pool labels and ignores null', () => {
    const matches = [
      match({ id: 'm1', pool: 'B' }),
      match({ id: 'm2', pool: 'A' }),
      match({ id: 'm3', pool: 'B' }),
      match({ id: 'm4', pool: null }),
    ];
    expect(distinctPools(matches)).toEqual(['A', 'B']);
  });

  it('returns an empty array when no match has a pool', () => {
    expect(distinctPools([match({ id: 'm1', pool: null })])).toEqual([]);
  });
});
