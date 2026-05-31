import type { LiveMatchScore } from './live-match-score.js';

/**
 * Which competition surface a live-scored match belongs to. Matches the
 * `kind` discriminator on `match_live_scores` and selects the host/captain
 * authorization predicate the write RPC applies. A plain union (not a branded
 * id) because the port is polymorphic over bracket *and* league match ids.
 */
export type MatchKind = 'bracket' | 'league';

/**
 * Repository port for the in-progress (live) score of a scheduled match —
 * ADR 0023. The persisted state is the {@link LiveMatchScore} value object,
 * written cheaply per point to a narrow `match_live_scores` row (NOT the
 * canonical bracket/league rows) and read by the public bracket/standings over
 * realtime.
 *
 * Authorization (host or either team's captain) is enforced at the persistence
 * boundary by the `upsert_match_live_score` / `clear_match_live_score` RPCs, so
 * the adapter MUST call them through a user-scoped client. The plain
 * service-role client would bypass the gate (AGENTS.md pitfall #8).
 */
export interface LiveMatchScoreRepository {
  /** Insert or replace the live score for `matchId`. Throws on an unauthorized caller. */
  upsert(matchId: string, kind: MatchKind, state: LiveMatchScore): Promise<void>;
  /**
   * Remove the live score. Idempotent — a no-op when none exists — so the
   * finalize path can call it unconditionally after folding the result into
   * the canonical record. Throws on an unauthorized caller.
   */
  clear(matchId: string): Promise<void>;
  /** Read the persisted live score, or null if the match has none in progress. */
  findByMatchId(matchId: string): Promise<LiveMatchScore | null>;
}
