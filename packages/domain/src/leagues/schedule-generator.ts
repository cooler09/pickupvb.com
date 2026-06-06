import { MatchId, type EntryId, type Seed } from '../brackets/match.js';
import { generateRoundRobin } from '../brackets/generators.js';
import { ValidationError } from '../shared/result.js';
import {
  LeagueMatchStatus,
  LeagueScheduleMatch,
  type LeagueScheduleMatchId,
} from './league-schedule.js';

const DAY_MS = 86_400_000;

export interface GenerateLeagueRoundRobinProps {
  /** Competing entries (`event_team_entries.id`). Order seeds the rotation. */
  entryIds: ReadonlyArray<EntryId>;
  /** Factory for the persisted `league_schedule_matches.id`. */
  mkId: () => LeagueScheduleMatchId;
  /** 1 = single round-robin (each pair once), 2 = double (each pair twice). */
  legs?: 1 | 2;
  /** Date/time of week 1's slate. Each later week adds `intervalDays`. */
  firstMatchAt: Date;
  /** Days between weekly slates. Default 7. */
  intervalDays?: number;
  /**
   * Optional court labels. When given, the matches within a week are spread
   * across these courts in order ("Court 1", "Court 2", …, wrapping).
   */
  courtLabels?: ReadonlyArray<string>;
}

/**
 * Lay out a weekly round-robin season into {@link LeagueScheduleMatch}es.
 *
 * Pairings come from the bracket circle-method {@link generateRoundRobin} (one
 * source of truth for the rotation, byes handled for odd team counts); this
 * function only maps each `round` → a calendar week and assigns courts. For a
 * **double** round-robin the second leg replays the same pairings with
 * home/away swapped and the weeks offset after the first leg.
 *
 * Pure: all dates are derived from `firstMatchAt`. The caller (the
 * generate-schedule handler) is responsible for the empty-slate guard and for
 * the event-window check — `LeagueSchedule.addMatch` rejects a `scheduledAt`
 * outside `[startsAt, endsAt]`, so an over-long season surfaces there.
 *
 * @throws {ValidationError} if fewer than 2 entries, an invalid `firstMatchAt`,
 *   or a non-positive `intervalDays`.
 */
export function generateLeagueRoundRobin(
  props: GenerateLeagueRoundRobinProps,
): LeagueScheduleMatch[] {
  const { entryIds, mkId, firstMatchAt } = props;
  const legs = props.legs ?? 1;
  const intervalDays = props.intervalDays ?? 7;
  const courtLabels = props.courtLabels ?? [];

  if (entryIds.length < 2) {
    throw new ValidationError('A round-robin schedule needs at least 2 teams.', {
      teamCount: entryIds.length,
    });
  }
  if (!(firstMatchAt instanceof Date) || Number.isNaN(firstMatchAt.getTime())) {
    throw new ValidationError('First match date/time is invalid.');
  }
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new ValidationError('Week interval must be a positive whole number of days.', {
      intervalDays,
    });
  }

  // We only use the (round, matchNumber, entryA, entryB) tuples from the
  // bracket generator; its MatchIds are discarded — a local counter satisfies
  // the factory and the real ids come from `mkId`.
  let counter = 0;
  const seeds: Seed[] = entryIds.map((entryId, i) => ({ entryId, seed: i + 1, pool: null }));
  const pairings = generateRoundRobin(seeds, () => MatchId(String(++counter)));
  const roundsPerLeg = pairings.reduce((max, m) => Math.max(max, m.round), 0);

  const out: LeagueScheduleMatch[] = [];
  for (let leg = 0; leg < legs; leg++) {
    const swap = leg % 2 === 1;
    for (const m of pairings) {
      const week = leg * roundsPerLeg + m.round;
      const scheduledAt = new Date(firstMatchAt.getTime() + (week - 1) * intervalDays * DAY_MS);
      const court =
        courtLabels.length > 0 ? courtLabels[(m.matchNumber - 1) % courtLabels.length]! : null;
      out.push(
        LeagueScheduleMatch.create({
          id: mkId(),
          weekNumber: week,
          scheduledAt,
          courtLabel: court,
          homeEntryId: swap ? m.entryBId : m.entryAId,
          awayEntryId: swap ? m.entryAId : m.entryBId,
          homeScore: null,
          awayScore: null,
          status: LeagueMatchStatus.Scheduled,
          notes: null,
        }),
      );
    }
  }

  return out;
}
