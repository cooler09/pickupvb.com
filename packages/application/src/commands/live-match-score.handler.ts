import type { LiveMatchScore, LiveMatchScoreRepository, MatchKind } from '@pickupvb/domain';

/**
 * Commands for the in-progress (live) score of a scheduled match — ADR 0023.
 *
 * These are deliberately thin: the {@link LiveMatchScore} value object already
 * enforces the scoring rules, and host/captain authorization is enforced at the
 * persistence boundary by the `upsert_match_live_score` /
 * `clear_match_live_score` RPCs (the adapter runs them on a user-scoped client).
 * The handlers exist for CQRS consistency and to give the write a test seam —
 * not to add a second layer of rules.
 *
 * Finalizing a live score into the official record is NOT here: it maps the
 * terminal state into the existing `RecordMatchResultCommand` /
 * `RecordLeagueMatchResultCommand` (see `scoring/live-match-finalize.ts`) and
 * runs those unchanged handlers, then clears the live row.
 */

export class UpsertLiveMatchScoreCommand {
  constructor(
    public readonly matchId: string,
    public readonly kind: MatchKind,
    public readonly state: LiveMatchScore,
  ) {}
}

export class UpsertLiveMatchScoreHandler {
  constructor(private readonly repo: LiveMatchScoreRepository) {}

  async execute(cmd: UpsertLiveMatchScoreCommand): Promise<void> {
    await this.repo.upsert(cmd.matchId, cmd.kind, cmd.state);
  }
}

export class ClearLiveMatchScoreCommand {
  constructor(public readonly matchId: string) {}
}

export class ClearLiveMatchScoreHandler {
  constructor(private readonly repo: LiveMatchScoreRepository) {}

  async execute(cmd: ClearLiveMatchScoreCommand): Promise<void> {
    await this.repo.clear(cmd.matchId);
  }
}
