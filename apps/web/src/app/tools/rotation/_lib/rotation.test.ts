import { describe, it, expect } from 'vitest';
import {
  createRotationState,
  addTeams,
  removeTeam,
  reportWin,
  clearCourt,
  setCourtCount,
  teamCount,
  formatRotationText,
} from './rotation.js';

const T0 = 1_000_000;

describe('createRotationState', () => {
  it('builds N empty courts and clamps the count', () => {
    expect(createRotationState(2, T0)).toMatchObject({
      courtCount: 2,
      courts: [
        { a: null, b: null },
        { a: null, b: null },
      ],
      queue: [],
    });
    expect(createRotationState(0, T0).courtCount).toBe(1);
    expect(createRotationState(99, T0).courtCount).toBe(12);
  });
});

describe('addTeams', () => {
  it('fills open court slots in order, then queues the overflow', () => {
    const s = addTeams(createRotationState(1, T0), ['A', 'B', 'C', 'D'], T0);
    expect(s.courts[0]).toEqual({ a: 'A', b: 'B' });
    expect(s.queue).toEqual(['C', 'D']);
    expect(s.version).toBe(1);
  });

  it('spreads across multiple courts', () => {
    const s = addTeams(createRotationState(2, T0), ['A', 'B', 'C', 'D'], T0);
    expect(s.courts).toEqual([
      { a: 'A', b: 'B' },
      { a: 'C', b: 'D' },
    ]);
    expect(s.queue).toEqual([]);
  });

  it('ignores blank lines', () => {
    const s = addTeams(createRotationState(1, T0), ['A', '  ', ''], T0);
    expect(s.courts[0]).toEqual({ a: 'A', b: null });
  });
});

describe('reportWin', () => {
  it('keeps the winner, sends the loser to the back, and brings the next team in', () => {
    const base = addTeams(createRotationState(1, T0), ['A', 'B', 'C', 'D'], T0);
    const after = reportWin(base, 0, 'a', T0);
    expect(after.courts[0]).toEqual({ a: 'A', b: 'C' }); // A stays, C comes up
    expect(after.queue).toEqual(['D', 'B']); // B (loser) to the back
  });

  it('is a no-op unless both slots are filled', () => {
    const solo = addTeams(createRotationState(1, T0), ['A'], T0);
    expect(reportWin(solo, 0, 'a', T0)).toBe(solo);
  });
});

describe('clearCourt', () => {
  it('sends both teams to the back of the queue and refills', () => {
    const base = addTeams(createRotationState(1, T0), ['A', 'B', 'C', 'D'], T0);
    const after = clearCourt(base, 0, T0);
    expect(after.courts[0]).toEqual({ a: 'C', b: 'D' });
    expect(after.queue).toEqual(['A', 'B']);
  });
});

describe('removeTeam', () => {
  it('drops a queued team and refills nothing extra', () => {
    const base = addTeams(createRotationState(1, T0), ['A', 'B', 'C'], T0);
    expect(removeTeam(base, 'C', T0).queue).toEqual([]);
  });

  it('drops a team off a court and pulls up the next', () => {
    const base = addTeams(createRotationState(1, T0), ['A', 'B', 'C'], T0);
    const after = removeTeam(base, 'B', T0);
    expect(after.courts[0]).toEqual({ a: 'A', b: 'C' });
    expect(after.queue).toEqual([]);
  });
});

describe('setCourtCount', () => {
  it('adds courts and pulls waiting teams onto them', () => {
    const base = addTeams(createRotationState(1, T0), ['A', 'B', 'C', 'D'], T0);
    const after = setCourtCount(base, 2, T0);
    expect(after.courts).toEqual([
      { a: 'A', b: 'B' },
      { a: 'C', b: 'D' },
    ]);
  });

  it('drops courts and returns their teams to the queue', () => {
    const base = addTeams(createRotationState(2, T0), ['A', 'B', 'C', 'D'], T0);
    const after = setCourtCount(base, 1, T0);
    expect(after.courtCount).toBe(1);
    expect(after.courts).toEqual([{ a: 'A', b: 'B' }]);
    expect(after.queue).toEqual(['C', 'D']);
  });
});

describe('teamCount / formatRotationText', () => {
  it('counts teams on courts and in the queue', () => {
    const s = addTeams(createRotationState(1, T0), ['A', 'B', 'C'], T0);
    expect(teamCount(s)).toBe(3);
  });

  it('renders courts and the up-next line', () => {
    const s = addTeams(createRotationState(1, T0), ['A', 'B', 'C'], T0);
    expect(formatRotationText(s)).toBe('Court 1: A vs B\n\nUp next: C');
  });
});
