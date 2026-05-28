import type { DivisionId } from '../events/division.js';
import type { LeagueSchedule, LeagueScheduleMatchId } from './league-schedule.js';

/**
 * Repository port for the {@link LeagueSchedule} aggregate. One schedule
 * per division. The save operation persists the full match list — the
 * adapter diffs and applies insert/update/delete against
 * `league_schedule_matches`.
 */
export interface LeagueScheduleRepository {
  nextMatchId(): LeagueScheduleMatchId;
  findByDivisionId(divisionId: DivisionId): Promise<LeagueSchedule | null>;
  save(schedule: LeagueSchedule): Promise<void>;
}
