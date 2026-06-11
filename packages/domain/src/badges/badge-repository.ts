/**
 * Write + read port for the badge subsystem. Implemented by
 * `SupabaseBadgeRepository` in infrastructure.
 *
 * Grants are **idempotent** — `grant` is a no-op (returns `false`) when the user
 * already holds the badge, so the reconcile use-case can run as often as it
 * likes (on profile view, on a cron, on backfill) without double-awarding. The
 * DB enforces this with a unique `(user_id, badge_key)` constraint for
 * system/easter-egg sources.
 */
import type { BadgeSource } from './badge-key.js';
import type { PlayerBadgeStats } from './player-badge-stats.js';

/** A badge the user has been granted (the read-side projection). */
export interface GrantedBadge {
  userId: string;
  badgeKey: string;
  source: BadgeSource;
  awardedAt: Date;
  /** Opaque context captured at grant time (e.g. `{ eventId }`); may be null. */
  context: Record<string, unknown> | null;
  /** Owner opted this badge out of public display. */
  hidden: boolean;
}

export interface BadgeGrantInput {
  userId: string;
  badgeKey: string;
  source: BadgeSource;
  context?: Record<string, unknown> | null;
}

export interface BadgeRepository {
  /**
   * Idempotently grant a badge. Returns `true` only when this call created the
   * grant (so callers can fire a one-time "unlocked!" toast), `false` when the
   * user already had it.
   */
  grant(input: BadgeGrantInput): Promise<boolean>;

  /** All badges granted to a user (includes hidden ones — owner view). */
  listForUser(userId: string): Promise<GrantedBadge[]>;

  /**
   * Aggregate the denormalised stats snapshot the system-badge rules consume.
   * The SQL joins live in the adapter; the thresholds stay in the catalog.
   */
  loadStats(userId: string): Promise<PlayerBadgeStats>;
}
