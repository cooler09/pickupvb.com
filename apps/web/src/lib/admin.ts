import 'server-only';
import { cache } from 'react';
import { repositories } from './handlers';
import { isPro } from './pro';
import { hasActiveProGrant } from './pro-grants';
import { hasClubProBenefits } from './club';

/**
 * Platform-admin check. Reads `profiles.is_platform_admin` via the
 * community-listing repository (the existing port that owns this query).
 * Per-request memoized via `React.cache` so pages that branch on admin
 * status across multiple side-load paths share a single lookup.
 */
export const isPlatformAdmin = cache(async (userId: string): Promise<boolean> => {
  return repositories.communityListingRepo.isPlatformAdmin(userId);
});

/**
 * Returns true when the user is entitled to Pro-tier features — because they
 * have an active Pro subscription, are a platform admin (admins get every Pro
 * benefit on the house), hold a comped Pro grant (e.g. a referral reward —
 * ADR 0039), or are an owner/admin of a group with a live **Club** subscription
 * (ADR 0038 O-2a — Club confers Pro on its admins).
 *
 * Use this for entitlement checks (platform-fee discount, paid-event
 * cap, CSV export, passes/memberships, etc.). Do NOT use it to drive the "Pro"
 * badge — admins display an Admin badge instead via `<AdminBadge />`. It's also
 * the single gate any new Pro perk must go through (not bare `isPro`), so comps
 * and Club benefits unlock everything.
 */
export async function hasProBenefits(userId: string): Promise<boolean> {
  const [pro, admin, grant, club] = await Promise.all([
    isPro(userId),
    isPlatformAdmin(userId),
    hasActiveProGrant(userId),
    hasClubProBenefits(userId),
  ]);
  return pro || admin || grant || club;
}
