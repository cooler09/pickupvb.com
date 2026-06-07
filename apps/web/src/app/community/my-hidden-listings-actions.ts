'use server';

import type { CommunityListingSummary } from '@pickupvb/domain';
import { repositories } from '@/lib/handlers';
import { getCurrentUser, isAnonymousUser } from '@/lib/server-auth';

/**
 * The signed-in viewer's own `hidden` community listings. Backs the
 * `<MyHiddenCommunityListings />` recovery strip so the `/community` listing
 * page itself can stay cookie-free + CDN-cacheable (performance audit P3 #17)
 * while still surfacing a submitter's auto-hidden listing — the only in-app path
 * back to it, since auto-hide (a DB trigger) sends no notification. Returns `[]`
 * for logged-out / anonymous callers.
 */
export async function getMyHiddenCommunityListings(): Promise<CommunityListingSummary[]> {
  const { user } = await getCurrentUser();
  if (!user || isAnonymousUser(user)) return [];
  return repositories.communityListingRepo.listHiddenBySubmitter(user.id);
}
