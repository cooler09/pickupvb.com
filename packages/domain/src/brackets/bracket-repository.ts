import type { DivisionId } from '../events/division.js';
import type { EventId, UserId } from '../events/volleyball-event.js';
import type { Bracket } from './bracket.js';
import type { BracketFormat, BracketStatus } from './enums.js';
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

/**
 * One row per division that has a bracket — the lightweight status projection
 * behind the division tabs' per-division pills (UX-9). Divisions without a
 * bracket are simply absent from the result.
 */
export interface DivisionBracketStatus {
  readonly divisionId: string;
  readonly status: BracketStatus;
}

/**
 * Lightweight projection for the standalone "My brackets" list (ADR 0025).
 * Avoids hydrating the full aggregate (seeds + matches + sets) per row.
 */
export interface BracketSummary {
  readonly id: string;
  readonly format: BracketFormat;
  readonly status: BracketStatus;
  readonly teamCount: number;
  readonly createdAt: Date;
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
  /**
   * Host-only full-replace persist. Used by the host-gated bracket
   * operations (create / seed / generate / reset / reorder), which are
   * authorized in the application layer and run through the service-role
   * client.
   */
  save(bracket: Bracket): Promise<void>;
  /**
   * Persist the full bracket state on behalf of the captain (or host) who
   * just acted on `actorMatchId` — recording or clearing that match's
   * result. Distinct from {@link save} because recording a result legitimately
   * mutates rows the captain has no direct RLS grant on (the downstream
   * match the winner advances into; the bracket header on completion), so
   * the write can't run as a plain user under RLS. The adapter routes
   * through a user-scoped client to an authorization-gated RPC that admits
   * the write only when the caller is the event host or a captain of
   * `actorMatchId`. The aggregate still owns the advancement/completion
   * logic; this method only persists the result it computed. Throws
   * `UnauthorizedError` when the caller is neither host nor a captain of
   * `actorMatchId`, `NotFoundError` when the match is unknown.
   */
  saveAsMatchActor(bracket: Bracket, actorMatchId: MatchId): Promise<void>;
  /**
   * Teams eligible for seeding into the bracket: those registered for the
   * given event division. Note: the parent event's `event_teams` rows may
   * still reference the legacy "all of event" scope until ADR-0006 phase 8
   * cleanup; the implementation filters on `division_id` and falls back to
   * the event scope only when no division-scoped rows exist.
   */
  listRegisteredTeams(eventId: EventId, divisionId: DivisionId): Promise<BracketTeamLite[]>;
  /**
   * Per-division bracket status for the given divisions — one row per division
   * that has a bracket (UX-9). Drives the status pill on each division tab so a
   * host can see at a glance which divisions are set up / live / final without
   * opening each tab. Viewer-independent (the `event_brackets` status is shared
   * across viewers).
   */
  listDivisionStatuses(
    divisionIds: ReadonlyArray<DivisionId>,
  ): Promise<ReadonlyArray<DivisionBracketStatus>>;
  /**
   * Standalone (ADR 0025) brackets owned by a user, newest first — for the
   * "My brackets" list. Summary projection, not full aggregates.
   */
  listByOwner(ownerUserId: UserId): Promise<ReadonlyArray<BracketSummary>>;
  /**
   * Typed-in competitor teams for a standalone bracket (from `bracket_teams`),
   * shaped like {@link BracketTeamLite} (teamId/captainId null) so the seeding
   * and board UI is reused unchanged.
   */
  listStandaloneTeams(bracketId: BracketId): Promise<BracketTeamLite[]>;
  /**
   * Insert a typed-in team into a standalone bracket; returns the new entry id
   * (`bracket_teams.id`, used as the opaque `EntryId` in seeds and match
   * wiring — see ADR 0025 on polymorphic entry ids).
   */
  addBracketTeam(bracketId: BracketId, name: string): Promise<{ entryId: string }>;
  /**
   * Bulk variant of {@link addBracketTeam}: insert several typed-in teams in a
   * single round-trip and return the new entry ids paired with their names
   * (input order preserved). Backs the standalone setup's "paste a list" flow.
   */
  addBracketTeams(
    bracketId: BracketId,
    names: ReadonlyArray<string>,
  ): Promise<Array<{ entryId: string; name: string }>>;
  /**
   * Permanently delete a bracket and everything under it (seeds, matches,
   * sets, typed-in teams, live-score rows — all FK `on delete cascade`). Used
   * by the standalone owner's "Delete bracket" action (ADR 0025) to abandon a
   * bracket and free the free-tier active-bracket slot. The caller must have
   * authorized the delete (owner gate) before invoking; the adapter runs it on
   * the service-role client.
   */
  deleteBracket(bracketId: BracketId): Promise<void>;
}
