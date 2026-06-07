'use server';

import { getCurrentUser, isAnonymousUser } from '@/lib/server-auth';
import {
  loadCommunityViewerChrome,
  type CommunityViewerChromeModel,
} from './_loaders/load-community-detail-page';

/**
 * Resolves the viewer-conditional chrome for a community listing (manage /
 * claim / report / pending-review). Invoked from the `CommunityViewerProvider`
 * client island after it confirms a real (non-anonymous) session, so the page
 * shell never reads `cookies()` and stays ISR-cacheable (performance audit
 * P2 #16). Returns `null` for logged-out / anonymous callers or when the
 * listing isn't visible to this viewer (the read enforces RLS / status gates).
 */
export async function getCommunityViewerChrome(
  slug: string,
): Promise<CommunityViewerChromeModel | null> {
  const { user } = await getCurrentUser();
  if (!user || isAnonymousUser(user)) return null;
  return loadCommunityViewerChrome(slug, user);
}
