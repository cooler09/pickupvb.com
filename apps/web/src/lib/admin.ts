import 'server-only';
import { repositories } from './handlers';
import { isPro } from './pro';

/**
 * Platform-admin check. Reads `profiles.is_platform_admin` via the
 * community-listing repository (the existing port that owns this query).
 * Cached per-request by React's data cache because `getServerSupabase`
 * does the same on the underlying read.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  return repositories.communityListingRepo.isPlatformAdmin(userId);
}

/**
 * Returns true when the user is entitled to Pro-tier features — either
 * because they have an active Pro subscription, or because they are a
 * platform admin (admins get every Pro benefit on the house).
 *
 * Use this for entitlement checks (platform-fee discount, paid-event
 * cap, CSV export, etc.). Do NOT use it to drive the "Pro" badge —
 * admins display an Admin badge instead via `<AdminBadge />`.
 */
export async function hasProBenefits(userId: string): Promise<boolean> {
  const [pro, admin] = await Promise.all([isPro(userId), isPlatformAdmin(userId)]);
  return pro || admin;
}
