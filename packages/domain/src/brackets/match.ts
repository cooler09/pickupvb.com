import type { Brand } from '../shared/brand.js';
import type { TeamId } from '../events/volleyball-event.js';
import type { AdvanceSlot, BracketSide, MatchStatus } from './enums.js';

export type BracketId = Brand<string, 'BracketId'>;
export type MatchId = Brand<string, 'MatchId'>;

/** A single set/game within a match (e.g. 25-21). */
export interface MatchSet {
  readonly setNumber: number;
  readonly teamAScore: number;
  readonly teamBScore: number;
}

/** A team's seeding within the bracket. `pool` only set for pool play. */
export interface Seed {
  readonly teamId: TeamId;
  readonly seed: number;
  readonly pool: string | null;
}

export interface Match {
  readonly id: MatchId;
  readonly round: number;
  readonly matchNumber: number;
  readonly pool: string | null;
  readonly bracketSide: BracketSide | null;
  teamAId: TeamId | null;
  teamBId: TeamId | null;
  winnerTeamId: TeamId | null;
  /**
   * Working / ref team — the team responsible for officiating this match.
   * Set by the pool generator (the idle team in the same pool's rotation
   * round) when `BracketConfig.requireWorkTeam` is true; null otherwise
   * and for formats that don't have a natural idle slot. Hosts may
   * override per-match in the UI. See ADR 0018.
   */
  workTeamId: TeamId | null;
  status: MatchStatus;
  sets: MatchSet[];
  /** Wiring: when this match completes, place the winner here. */
  readonly advancesToMatchId: MatchId | null;
  readonly advancesToSlot: AdvanceSlot | null;
  /** Wiring for losers bracket / consolation. */
  readonly loserAdvancesToMatchId: MatchId | null;
  readonly loserAdvancesToSlot: AdvanceSlot | null;
  scheduledAt: Date | null;
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
