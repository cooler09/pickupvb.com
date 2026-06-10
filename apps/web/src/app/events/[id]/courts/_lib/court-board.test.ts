import { describe, expect, it } from 'vitest';
import { buildCourtBoard, type CourtMatch } from './court-board';

function m(over: Partial<CourtMatch> & Pick<CourtMatch, 'id' | 'status'>): CourtMatch {
  return {
    court: 'Court 1',
    divisionLabel: 'Open',
    stageLabel: 'Bracket',
    teamA: 'A',
    teamB: 'B',
    sortKey: 0,
    ...over,
  };
}

describe('buildCourtBoard', () => {
  it('pivots by court: live → now, soonest upcoming → next, rest → laterCount', () => {
    const board = buildCourtBoard([
      m({ id: 'live', status: 'live', court: 'Court 1' }),
      m({ id: 'soon', status: 'upcoming', court: 'Court 1', sortKey: 5 }),
      m({ id: 'later', status: 'upcoming', court: 'Court 1', sortKey: 9 }),
      m({ id: 'done', status: 'done', court: 'Court 1' }),
    ]);
    expect(board.courts).toHaveLength(1);
    const col = board.courts[0]!;
    expect(col.court).toBe('Court 1');
    expect(col.now?.id).toBe('live');
    expect(col.next?.id).toBe('soon');
    expect(col.laterCount).toBe(1);
  });

  it('natural-sorts court labels so Court 2 precedes Court 10', () => {
    const board = buildCourtBoard([
      m({ id: 'a', status: 'live', court: 'Court 10' }),
      m({ id: 'b', status: 'live', court: 'Court 2' }),
      m({ id: 'c', status: 'live', court: 'Court 1' }),
    ]);
    expect(board.courts.map((c) => c.court)).toEqual(['Court 1', 'Court 2', 'Court 10']);
  });

  it('an open court (no live, no upcoming) reports now/next null', () => {
    const board = buildCourtBoard([m({ id: 'done', status: 'done', court: 'Court 3' })]);
    const col = board.courts[0]!;
    expect(col.now).toBeNull();
    expect(col.next).toBeNull();
    expect(col.laterCount).toBe(0);
  });

  it('routes court-less matches to the unassigned buckets and reports hasCourts=false', () => {
    const board = buildCourtBoard([
      m({ id: 'l', status: 'live', court: null }),
      m({ id: 'u1', status: 'upcoming', court: '', sortKey: 2 }),
      m({ id: 'u0', status: 'upcoming', court: '   ', sortKey: 1 }),
    ]);
    expect(board.hasCourts).toBe(false);
    expect(board.courts).toHaveLength(0);
    expect(board.unassignedNow.map((x) => x.id)).toEqual(['l']);
    // upcoming sorted by sortKey
    expect(board.unassignedNext.map((x) => x.id)).toEqual(['u0', 'u1']);
  });

  it('mixes assigned and unassigned: hasCourts true, court-less still surface', () => {
    const board = buildCourtBoard([
      m({ id: 'c1', status: 'live', court: 'Court 1' }),
      m({ id: 'free', status: 'live', court: null }),
    ]);
    expect(board.hasCourts).toBe(true);
    expect(board.courts).toHaveLength(1);
    expect(board.unassignedNow.map((x) => x.id)).toEqual(['free']);
  });
});
