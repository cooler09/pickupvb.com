import type { DivisionId } from '../events/division.js';
import type { EventId } from '../events/volleyball-event.js';
import type { Bracket } from './bracket.js';
import type { BracketId, MatchId } from './match.js';

/**
 * Read model returned to the bracket UI: enriched with team display info
 * the domain doesn't carry (names, captain ids for permission checks).
 */
export interface BracketTeamLite {
  readonly teamId: string;
  /**
   * The `event_team_entries.id` row backing this team's registration in
   * the division. Always populated; stable across the polymorphic-pair
   * transition. Future bundles flip seed + match writes from `teamId`
   * (FK → `teams.id`) onto `entryId` (FK → `event_team_entries.id`)
   * so ad-hoc and walk-in entries — which have no persistent `teams`
   * row — can be wired into brackets.
   */
  readonly entryId: string;
  readonly name: string;
  readonly captainId: string;
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
