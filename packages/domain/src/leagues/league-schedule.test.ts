import { describe, expect, it } from 'vitest';

import type { DivisionId } from '../events/division.js';
import type { EntryId } from '../brackets/match.js';
import { ConflictError, InvariantViolation, NotFoundError } from '../shared/result.js';
import {
  LeagueMatchStatus,
  LeagueSchedule,
  LeagueScheduleMatch,
  type EventWindow,
  type LeagueScheduleMatchId,
} from './league-schedule.js';

const DIVISION_ID = 'div-1' as DivisionId;
const TEAM_A = 'team-a' as EntryId;
const TEAM_B = 'team-b' as EntryId;

const WINDOW: EventWindow = {
  startsAt: new Date('2026-09-01T00:00:00Z'),
  endsAt: new Date('2026-12-15T23:59:59Z'),
};

function makeMatch(
  id: string,
  overrides: Partial<{
    weekNumber: number;
    scheduledAt: Date;
    homeEntryId: EntryId | null;
    awayEntryId: EntryId | null;
    homeScore: number | null;
    awayScore: number | null;
    status: LeagueMatchStatus;
    courtLabel: string | null;
    notes: string | null;
  }> = {},
): LeagueScheduleMatch {
  return LeagueScheduleMatch.create({
    id: id as LeagueScheduleMatchId,
    weekNumber: overrides.weekNumber ?? 1,
    scheduledAt: overrides.scheduledAt ?? new Date('2026-09-08T19:00:00Z'),
    courtLabel: overrides.courtLabel ?? null,
    homeEntryId: overrides.homeEntryId === undefined ? TEAM_A : overrides.homeEntryId,
    awayEntryId: overrides.awayEntryId === undefined ? TEAM_B : overrides.awayEntryId,
    homeScore: overrides.homeScore ?? null,
    awayScore: overrides.awayScore ?? null,
    status: overrides.status ?? LeagueMatchStatus.Scheduled,
    notes: overrides.notes ?? null,
  });
}

describe('LeagueScheduleMatch invariants', () => {
  it('accepts a valid scheduled match', () => {
    const m = makeMatch('m-1');
    expect(m.weekNumber).toBe(1);
    expect(m.status).toBe(LeagueMatchStatus.Scheduled);
  });

  it('rejects week_number < 1', () => {
    expect(() => makeMatch('m-1', { weekNumber: 0 })).toThrow(InvariantViolation);
  });

  it('rejects non-integer week_number', () => {
    expect(() => makeMatch('m-1', { weekNumber: 1.5 })).toThrow(InvariantViolation);
  });

  it('rejects same home and away team', () => {
    expect(() => makeMatch('m-1', { homeEntryId: TEAM_A, awayEntryId: TEAM_A })).toThrow(
      InvariantViolation,
    );
  });

  it('allows both teams null (placeholder slot)', () => {
    const m = makeMatch('m-1', { homeEntryId: null, awayEntryId: null });
    expect(m.homeEntryId).toBeNull();
    expect(m.awayEntryId).toBeNull();
  });

  it('rejects negative scores', () => {
    expect(() => makeMatch('m-1', { homeScore: -1 })).toThrow(InvariantViolation);
    expect(() => makeMatch('m-1', { awayScore: -3 })).toThrow(InvariantViolation);
  });
});

describe('LeagueSchedule invariants', () => {
  it('accepts an empty schedule', () => {
    const s = LeagueSchedule.create({ divisionId: DIVISION_ID, eventWindow: WINDOW });
    expect(s.matches).toHaveLength(0);
    expect(s.divisionId).toBe(DIVISION_ID);
  });

  it('rejects event window with endsAt before startsAt', () => {
    expect(() =>
      LeagueSchedule.create({
        divisionId: DIVISION_ID,
        eventWindow: { startsAt: WINDOW.endsAt, endsAt: WINDOW.startsAt },
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects a match scheduled before the event window opens', () => {
    expect(() =>
      LeagueSchedule.create({
        divisionId: DIVISION_ID,
        eventWindow: WINDOW,
        matches: [makeMatch('m-1', { scheduledAt: new Date('2026-08-30T19:00:00Z') })],
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects a match scheduled after the event window closes', () => {
    expect(() =>
      LeagueSchedule.create({
        divisionId: DIVISION_ID,
        eventWindow: WINDOW,
        matches: [makeMatch('m-1', { scheduledAt: new Date('2027-01-01T19:00:00Z') })],
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects duplicate match ids at construction', () => {
    expect(() =>
      LeagueSchedule.create({
        divisionId: DIVISION_ID,
        eventWindow: WINDOW,
        matches: [makeMatch('m-1'), makeMatch('m-1', { weekNumber: 2 })],
      }),
    ).toThrow(ConflictError);
  });

  it('addMatch appends and rejects duplicates', () => {
    const s = LeagueSchedule.create({ divisionId: DIVISION_ID, eventWindow: WINDOW });
    s.addMatch(makeMatch('m-1'));
    expect(s.matches).toHaveLength(1);
    expect(() => s.addMatch(makeMatch('m-1', { weekNumber: 3 }))).toThrow(ConflictError);
  });

  it('addMatch rejects matches outside the event window', () => {
    const s = LeagueSchedule.create({ divisionId: DIVISION_ID, eventWindow: WINDOW });
    expect(() =>
      s.addMatch(makeMatch('m-out', { scheduledAt: new Date('2027-02-01T19:00:00Z') })),
    ).toThrow(InvariantViolation);
  });

  it('removeMatch removes and throws NotFoundError for unknown ids', () => {
    const s = LeagueSchedule.create({ divisionId: DIVISION_ID, eventWindow: WINDOW });
    s.addMatch(makeMatch('m-1'));
    s.removeMatch('m-1' as LeagueScheduleMatchId);
    expect(s.matches).toHaveLength(0);
    expect(() => s.removeMatch('m-1' as LeagueScheduleMatchId)).toThrow(NotFoundError);
  });

  it('replaceMatch swaps in a new value for the same id', () => {
    const s = LeagueSchedule.create({
      divisionId: DIVISION_ID,
      eventWindow: WINDOW,
      matches: [makeMatch('m-1', { weekNumber: 1, status: LeagueMatchStatus.Scheduled })],
    });
    s.replaceMatch(
      makeMatch('m-1', {
        weekNumber: 1,
        homeScore: 21,
        awayScore: 18,
        status: LeagueMatchStatus.Completed,
      }),
    );
    expect(s.matches[0]?.status).toBe(LeagueMatchStatus.Completed);
    expect(s.matches[0]?.homeScore).toBe(21);
  });

  it('replaceMatch rejects unknown ids', () => {
    const s = LeagueSchedule.create({ divisionId: DIVISION_ID, eventWindow: WINDOW });
    expect(() => s.replaceMatch(makeMatch('m-missing'))).toThrow(NotFoundError);
  });

  it('fromPersistence skips window validation so re-dated events still hydrate', () => {
    const m = makeMatch('m-1', { scheduledAt: new Date('2026-10-01T19:00:00Z') });
    const narrowWindow: EventWindow = {
      startsAt: new Date('2026-11-01T00:00:00Z'),
      endsAt: new Date('2026-11-30T00:00:00Z'),
    };
    const s = LeagueSchedule.fromPersistence(DIVISION_ID, narrowWindow, [m]);
    expect(s.matches).toHaveLength(1);
  });
});
