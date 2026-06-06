import { describe, expect, it } from 'vitest';
import { generateLeagueRoundRobin } from './schedule-generator.js';
import { LeagueScheduleMatchId } from './league-schedule.js';
import { EntryId } from '../brackets/match.js';

// `generateLeagueRoundRobin` maps a circle-method round-robin onto weekly
// league fixtures. These cases pin the round→week mapping, the bye handling
// for odd team counts, the double-leg layout, court assignment, and the
// date spacing.

function ids(...labels: string[]): EntryId[] {
  return labels.map((l) => EntryId(l));
}

function mkIdFactory(): () => LeagueScheduleMatchId {
  let i = 0;
  return () => LeagueScheduleMatchId(`m${++i}`);
}

/** Unordered "A|B" key so home/away orientation doesn't matter. */
function pairKey(home: string | null, away: string | null): string {
  return [String(home), String(away)].sort().join('|');
}

const WEEK1 = new Date('2026-09-01T18:00:00.000Z');

describe('generateLeagueRoundRobin', () => {
  it('lays a 4-team single round-robin into 3 weeks of 2 matches, each pair once', () => {
    const matches = generateLeagueRoundRobin({
      entryIds: ids('A', 'B', 'C', 'D'),
      mkId: mkIdFactory(),
      firstMatchAt: WEEK1,
    });

    expect(matches).toHaveLength(6);
    expect(Math.max(...matches.map((m) => m.weekNumber))).toBe(3);

    const pairs = matches.map((m) => pairKey(m.homeEntryId, m.awayEntryId));
    expect(new Set(pairs).size).toBe(6); // every pairing exactly once
    expect(matches.every((m) => m.status === 'scheduled')).toBe(true);
  });

  it('handles an odd team count with byes (3 teams → 3 matches, each pair once)', () => {
    const matches = generateLeagueRoundRobin({
      entryIds: ids('A', 'B', 'C'),
      mkId: mkIdFactory(),
      firstMatchAt: WEEK1,
    });

    expect(matches).toHaveLength(3);
    // No match ever pairs a team against the bye (null).
    expect(matches.every((m) => m.homeEntryId !== null && m.awayEntryId !== null)).toBe(true);
    const pairs = new Set(matches.map((m) => pairKey(m.homeEntryId, m.awayEntryId)));
    expect(pairs).toEqual(new Set(['A|B', 'A|C', 'B|C']));
  });

  it('doubles the slate for legs=2, offsetting weeks and replaying each pairing twice', () => {
    const matches = generateLeagueRoundRobin({
      entryIds: ids('A', 'B', 'C', 'D'),
      mkId: mkIdFactory(),
      firstMatchAt: WEEK1,
      legs: 2,
    });

    expect(matches).toHaveLength(12);
    expect(Math.max(...matches.map((m) => m.weekNumber))).toBe(6);

    const counts = new Map<string, number>();
    for (const m of matches) {
      const k = pairKey(m.homeEntryId, m.awayEntryId);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect([...counts.values()].every((c) => c === 2)).toBe(true);
  });

  it('assigns courts round-robin within each week', () => {
    const matches = generateLeagueRoundRobin({
      entryIds: ids('A', 'B', 'C', 'D'),
      mkId: mkIdFactory(),
      firstMatchAt: WEEK1,
      courtLabels: ['Court 1', 'Court 2'],
    });
    const week1 = matches.filter((m) => m.weekNumber === 1).map((m) => m.courtLabel);
    expect(new Set(week1)).toEqual(new Set(['Court 1', 'Court 2']));
  });

  it('spaces weeks by intervalDays from the first match', () => {
    const matches = generateLeagueRoundRobin({
      entryIds: ids('A', 'B', 'C', 'D'),
      mkId: mkIdFactory(),
      firstMatchAt: WEEK1,
      intervalDays: 7,
    });
    const week2 = matches.find((m) => m.weekNumber === 2)!;
    expect(week2.scheduledAt.toISOString()).toBe('2026-09-08T18:00:00.000Z');
  });

  it('rejects fewer than 2 teams', () => {
    expect(() =>
      generateLeagueRoundRobin({ entryIds: ids('A'), mkId: mkIdFactory(), firstMatchAt: WEEK1 }),
    ).toThrow(/at least 2 teams/);
  });
});
