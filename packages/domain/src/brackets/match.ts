import { idConstructor, type Brand } from '../shared/brand.js';
import type { AdvanceSlot, BracketSide, MatchStatus } from './enums.js';

export type BracketId = Brand<string, 'BracketId'>;
export const BracketId = idConstructor<'BracketId'>();
export type MatchId = Brand<string, 'MatchId'>;
export const MatchId = idConstructor<'MatchId'>();
/**
 * Identifier for an `event_team_entries` row — the polymorphic
 * participant identity (covers both roster `event_teams` and ad-hoc
 * `event_team_registrations`). Bracket matches store this for the
 * A/B/winner/work slots; persistence writes the `entry_*_id` columns on
 * `bracket_matches`. (The legacy `team_*_id` columns were dropped in migration
 * `20260813000000_drop_legacy_team_id_columns`.)
 */
export type EntryId = Brand<string, 'EntryId'>;
export const EntryId = idConstructor<'EntryId'>();

/** A single set/game within a match (e.g. 25-21). */
export interface MatchSet {
  readonly setNumber: number;
  readonly teamAScore: number;
  readonly teamBScore: number;
}

/** A team's seeding within the bracket. `pool` only set for pool play. */
export interface Seed {
  /**
   * Participant identity — points at `event_team_entries.id`. Persisted
   * as `bracket_seeds.entry_id`.
   */
  readonly entryId: EntryId;
  readonly seed: number;
  readonly pool: string | null;
}

export interface Match {
  readonly id: MatchId;
  readonly round: number;
  readonly matchNumber: number;
  readonly pool: string | null;
  readonly bracketSide: BracketSide | null;
  /**
   * Polymorphic participant identifiers — point at
   * `event_team_entries.id`. Persisted as `entry_a_id` / `entry_b_id` /
   * `winner_entry_id` on `bracket_matches`. May be null until feeder
   * matches complete and place a winner here.
   */
  entryAId: EntryId | null;
  entryBId: EntryId | null;
  winnerEntryId: EntryId | null;
  /**
   * Working / ref team \u2014 the team responsible for officiating this match.
   * Set by the pool generator (the idle team in the same pool's rotation
   * round) when `BracketConfig.requireWorkTeam` is true; null otherwise
   * and for formats that don't have a natural idle slot. Hosts may
   * override per-match in the UI. See ADR 0018. Persisted as
   * `bracket_matches.work_entry_id` (parallel to A/B/winner). (The legacy
   * `work_team_id` column was dropped in migration
   * `20260813000000_drop_legacy_team_id_columns`.)
   */
  workTeamId: EntryId | null;
  status: MatchStatus;
  sets: MatchSet[];
  /**
   * Court label (free text, chosen from `BracketConfig.courtLabels`) the
   * match is scheduled on. Paired with {@link slot} — matches sharing a
   * slot run in parallel on different courts. Null when courts are not
   * configured. See ADR 0018.
   */
  court: string | null;
  /**
   * 1-indexed time slot. All matches with the same `slot` run in
   * parallel; teams playing in slot N must not also play or ref any
   * other match in slot N. Null when courts are not configured.
   */
  slot: number | null;
  /**
   * Per-match best-of override (ADR 0032). `null` ⇒ fall back to the
   * stage default (pool vs playoff) and then `BracketConfig.bestOf`. The
   * aggregate resolves the effective value before calling
   * {@link determineWinner}. Persisted as `bracket_matches.best_of`.
   */
  bestOf: number | null;
  /**
   * Per-match target score override (ADR 0032) — the number a game is
   * played to (e.g. 25 / 21 / 15). Informational: shown in the UI and
   * stored, but NOT enforced by {@link determineWinner} (scoring stays
   * free-form). `null` ⇒ stage default then `BracketConfig.targetScore`.
   * Persisted as `bracket_matches.target_score`.
   */
  targetScore: number | null;
  /** Wiring: when this match completes, place the winner here. */
  readonly advancesToMatchId: MatchId | null;
  readonly advancesToSlot: AdvanceSlot | null;
  /** Wiring for losers bracket / consolation. */
  readonly loserAdvancesToMatchId: MatchId | null;
  readonly loserAdvancesToSlot: AdvanceSlot | null;
  scheduledAt: Date | null;
}

/** Stage / global defaults needed to resolve a match's effective best-of. */
export interface MatchLengthDefaults {
  readonly bestOf: number;
  readonly playoffBestOf: number | null;
}

/**
 * Resolve a match's **effective** best-of: per-match override →
 * playoff-stage default (for `final` matches) → global default. This is the
 * same precedence {@link Bracket} applies internally before picking a winner,
 * exported so the UI can show the matching number of set inputs and the
 * correct "Best of N" label — otherwise a playoff match (or any per-match
 * override) renders against the bracket-wide default and "doesn't adhere to
 * the format" (ADR 0032).
 */
export function effectiveBestOf(
  match: Pick<Match, 'bestOf' | 'bracketSide'>,
  defaults: MatchLengthDefaults,
): number {
  if (match.bestOf !== null) return match.bestOf;
  if (match.bracketSide === 'final' && defaults.playoffBestOf !== null) {
    return defaults.playoffBestOf;
  }
  return defaults.bestOf;
}

/** Stage / global defaults needed to resolve a match's effective target score. */
export interface MatchTargetDefaults {
  readonly targetScore: number | null;
  readonly playoffTargetScore: number | null;
}

/**
 * Resolve a match's **effective** target score (the number a game is played to
 * — informational, never enforced): per-match override → playoff-stage default
 * (for `final` matches) → global default. Mirrors {@link effectiveBestOf}.
 */
export function effectiveTargetScore(
  match: Pick<Match, 'targetScore' | 'bracketSide'>,
  defaults: MatchTargetDefaults,
): number | null {
  if (match.targetScore !== null) return match.targetScore;
  if (match.bracketSide === 'final' && defaults.playoffTargetScore !== null) {
    return defaults.playoffTargetScore;
  }
  return defaults.targetScore;
}

/**
 * Compute the match winner from its sets given a best-of-N format.
 * Returns null while neither side has clinched a majority.
 *
 * Generic: does not enforce volleyball-specific scoring (25, win-by-2).
 * Each set is "won" by whichever side scored more; ties are invalid.
 */
export function determineWinner(
  sets: ReadonlyArray<MatchSet>,
  teamAId: string | null,
  teamBId: string | null,
  bestOf: number,
): string | null {
  if (!teamAId || !teamBId) return null;
  if (sets.length === 0) return null;
  const needed = Math.floor(bestOf / 2) + 1;
  let aWins = 0;
  let bWins = 0;
  for (const s of sets) {
    if (s.teamAScore === s.teamBScore) return null;
    if (s.teamAScore > s.teamBScore) aWins += 1;
    else bWins += 1;
    if (aWins >= needed) return teamAId;
    if (bWins >= needed) return teamBId;
  }
  return null;
}
