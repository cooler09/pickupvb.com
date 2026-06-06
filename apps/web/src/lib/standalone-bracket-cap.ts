import 'server-only';
import { repositories } from './handlers';
import { hasProBenefits } from './admin';
import { UserId } from '@pickupvb/domain';

/**
 * Free-tier cap on **active** standalone brackets (ADR 0025 addendum /
 * monetization R-3). A Free host may have at most this many _non-completed_
 * standalone brackets in flight at once; Pro hosts (and platform admins) are
 * unlimited.
 *
 * "Active" deliberately means **not yet completed** rather than "exists": a
 * Free host keeps their full history of completed tournaments and only an
 * in-progress bracket occupies the slot. Finishing or deleting the current
 * bracket frees it. This is a net-new gate on a net-new surface, not a clawback
 * of any previously-free capability (the in-event bracket generator stays free,
 * uncapped — ADR 0014 "Pro grows via net-new features, never takeaways").
 */
export const FREE_ACTIVE_BRACKET_CAP = 1;

// The /brackets/new cap panel already renders an "Upgrade to Pro" button, so
// this message must not repeat the raw URL — keep it prose-only.
const CAP_MESSAGE =
  `Free hosts can run ${FREE_ACTIVE_BRACKET_CAP} standalone bracket at a time. ` +
  `Finish or delete your current bracket, or upgrade to Pro for unlimited brackets.`;

/** Result of the cap check. `ok: false` carries a user-facing `reason`. */
export type BracketCapResult = { ok: true } | { ok: false; reason: string };

/**
 * Enforce the free-tier "1 active standalone bracket" cap. Mirrors
 * `validateHostPaidEventCap` (the paid-event cap): Pro short-circuits, otherwise
 * count and compare. Counts off the existing `listByOwner` summary projection
 * (the cap only runs for non-Pro hosts, who have a handful of brackets at most),
 * so no new repository read is introduced.
 */
export async function validateActiveBracketCap(ownerUserId: string): Promise<BracketCapResult> {
  if (await hasProBenefits(ownerUserId)) return { ok: true };
  const brackets = await repositories.bracketRepo.listByOwner(UserId(ownerUserId));
  const activeCount = brackets.filter((b) => b.status !== 'completed').length;
  if (activeCount >= FREE_ACTIVE_BRACKET_CAP) return { ok: false, reason: CAP_MESSAGE };
  return { ok: true };
}
