import type { UserId } from '../events/volleyball-event.js';

/**
 * Write port for user blocks (ADR 0028, Phase 3). A block is a self-managed
 * directional edge — `blocker_id` blocks `blocked_id` — with no invariant of
 * its own beyond the DB's not-self CHECK, so (like `Group.addFollowEdge`) it is
 * a focused edge port rather than a loaded aggregate. The *effect* of a block is
 * symmetric: `is_blocked_pair` gates DM creation and sends in both directions,
 * but the edge itself (and the block/unblock toggle) is one-directional. RLS
 * scopes every operation to `blocker_id = auth.uid()`.
 */
export interface UserBlockRepository {
  /** Block a user. Idempotent — re-blocking an existing edge is a no-op. */
  block(blockerId: UserId, blockedId: UserId): Promise<void>;
  /** Remove the caller's block on a user. Idempotent. */
  unblock(blockerId: UserId, blockedId: UserId): Promise<void>;
  /** Whether `blockerId` currently blocks `blockedId` (one-directional). */
  hasBlocked(blockerId: UserId, blockedId: UserId): Promise<boolean>;
}
