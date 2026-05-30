/**
 * Match binding for the scoreboard — ADR 0023 Phase 4.
 *
 * When the scoreboard is launched from a scheduled bracket/league match (via
 * `ScoreLiveButton`), these params travel as query string on the
 * `/tools/scoreboard/{code}` URL. The page parses them into a `MatchBinding`
 * and hands it to `ScoreboardView`, which then shows a "Save final to match"
 * affordance that finalizes the live score into the official record. Absent
 * (the plain free tool), the scoreboard behaves exactly as before.
 */
import type { MatchKind } from '@pickupvb/domain';

export type { MatchKind };

export interface MatchBinding {
  eventId: string;
  divisionId: string;
  matchId: string;
  kind: MatchKind;
  /** Page to send the host back to (and revalidate) after saving. */
  returnPath: string;
}
