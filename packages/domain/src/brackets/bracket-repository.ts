import type { DivisionId } from '../events/division.js';
import type { EventId } from '../events/volleyball-event.js';
import type { Bracket } from './bracket.js';
import type { BracketId, MatchId } from './match.js';

/**
 * Read model returned to the bracket UI: enriched with team display info
 * the domain doesn't carry (names, captain ids for permission checks).
 */
export interface BracketTeamLite {
  /**
   * The persistent `teams.id` for roster-mode entries. Null for ad-hoc
   * and walk-in entries, which exist only as `event_team_entries` rows
   * and have no recurring `teams` identity. Downstream lookups should
   * use `entryId` as the stable identifier; `teamId` is retained for
   * league-side surfaces (`league_schedule_matches.home_team_id` /
   * `away_team_id` still FK into `teams.id`) and is filtered out at
   * those boundaries.
   */
  readonly teamId: string | null;
  /**
   * The `event_team_entries.id` row backing this entry. Always populated
   * for every registered participant regardless of source — the right
   * identifier for bracket seed/match wiring after the 2026-12-04 cutover.
   */
  readonly entryId: string;
  readonly name: string;
  /**
   * Account id of the captain for permission checks (e.g. "can the
   * viewer record this match's score?"). Null for walk-in entries
   * (no captain user account stands behind them — only a freeform
   * `captain_display_name` on the entry row).
   */
  readonly captainId: string | null;
  /**
   * For league rostered teams, the timestamp at which the host marked
   * the team as withdrawn mid-season. Null for active teams and for
   * non-league contexts where forfeit isn't a concept.
   */
  readonly forfeitedAt: Date | null;
}

export interface BracketReadModel {
  readonly bracket: Bracket;
  readonly teams: ReadonlyArray<BracketTeamLite>;
}

export interface BracketRepository {
  /** Generate a new domain MatchId. Used by the aggregate's `generate()`. */
  nextMatchId(): MatchId;
  /** Generate a new domain BracketId for `Bracket.create`. */
  nextBracketId(): BracketId;

  findByDivisionId(divisionId: DivisionId): Promise<Bracket | null>;
  /** Used by the match-result handler which only knows the match id. */
  findByMatchId(matchId: MatchId): Promise<Bracket | null>;
  findById(id: BracketId): Promise<Bracket | null>;
  save(bracket: Bracket): Promise<void>;
  /**
   * Teams eligible for seeding into the bracket: those registered for the
   * given event division. Note: the parent event's `event_teams` rows may
   * still reference the legacy "all of event" scope until ADR-0006 phase 8
   * cleanup; the implementation filters on `division_id` and falls back to
   * the event scope only when no division-scoped rows exist.
   */
  listRegisteredTeams(eventId: EventId, divisionId: DivisionId): Promise<BracketTeamLite[]>;
}
