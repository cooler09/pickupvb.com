/**
 * The system-badge earn rule, in one place.
 *
 * Pure and total: given a `PlayerBadgeStats` snapshot it returns every system
 * badge the user currently qualifies for, in catalog (display) order. The
 * application reconcile use-case grants each idempotently — so this function is
 * the *whole* "what has this player earned?" decision, and `badge-rules.test.ts`
 * is its executable spec.
 */
import { SYSTEM_BADGES } from './badge-catalog.js';
import type { SystemBadgeKey } from './badge-key.js';
import type { PlayerBadgeStats } from './player-badge-stats.js';

/** Every system badge the given stats snapshot earns, in catalog order. */
export function badgesForStats(stats: PlayerBadgeStats): SystemBadgeKey[] {
  return SYSTEM_BADGES.filter((b) => b.qualifies(stats)).map((b) => b.key);
}
