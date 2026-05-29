import type { DivisionId } from '../events/division.js';
import type {
  LeagueMatchStatus,
  LeagueSchedule,
  LeagueScheduleMatchId,
} from './league-schedule.js';

/** Input for {@link LeagueScheduleRepository.recordMatchResult}. */
export interface RecordLeagueMatchResultInput {
  divisionId: DivisionId;
  matchId: LeagueScheduleMatchId;
  homeScore: number;
  awayScore: number;
  status: LeagueMatchStatus;
}

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
  /**
   * Persist scores + status for a single match via a narrow, RLS-enforced
   * UPDATE (host or either team's captain). Distinct from {@link save},
   * which full-replaces the slate and is host-only. The captain-reachable
   * score-entry flow MUST use this method through a user-scoped client so
   * the `league_schedule_matches_update` policy actually enforces
   * authorization. Throws `UnauthorizedError` when the caller is neither
   * host nor a captain of the match, `NotFoundError` when the match is
   * unknown.
   */
  recordMatchResult(input: RecordLeagueMatchResultInput): Promise<void>;
}
