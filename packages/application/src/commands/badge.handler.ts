/**
 * Reconcile a single user's system achievement badges.
 *
 * Pure orchestration: pull the denormalised stats snapshot, run the catalog
 * earn rules (`badgesForStats`), and grant each idempotently. Returns the keys
 * that were *newly* granted on this run so the caller can fire a one-time
 * "unlocked!" toast (balanced-tone delight) — an already-held badge is silently
 * skipped by the repository's idempotent `grant`.
 *
 * This is the single grant decision point. It is safe to call as often as we
 * like — on the owner viewing their profile, from the reconcile cron, or as a
 * one-time backfill — because every grant is idempotent. There is intentionally
 * no second copy of the thresholds in SQL: the adapter only aggregates the
 * snapshot, the catalog owns the rule.
 */
import { badgesForStats, type BadgeRepository, type SystemBadgeKey } from '@pickupvb/domain';

export class ReconcileUserBadgesHandler {
  constructor(private readonly repo: BadgeRepository) {}

  /** Grants every system badge the user now qualifies for; returns the new ones. */
  async execute(userId: string): Promise<SystemBadgeKey[]> {
    const stats = await this.repo.loadStats(userId);
    const earned = badgesForStats(stats);
    const newlyGranted: SystemBadgeKey[] = [];
    for (const key of earned) {
      const created = await this.repo.grant({ userId, badgeKey: key, source: 'system' });
      if (created) newlyGranted.push(key);
    }
    return newlyGranted;
  }
}
