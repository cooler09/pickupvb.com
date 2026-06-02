'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { profileCacheTag } from '@/lib/cache-tags';
import { getCurrentUser } from '@/lib/server-auth';
import { grantEasterEggBadge } from '@/lib/badges';

/**
 * Claim the hidden "Secret Set" badge (Phase 3 easter egg) — invoked by the
 * Konami-code listener on the profile. Idempotent; returns whether the badge
 * was newly granted so the client can tailor its toast. No-ops for signed-out
 * callers and validates the key inside `grantEasterEggBadge`, so this can't be
 * abused to mint arbitrary badges.
 */
export async function claimKonamiBadge(): Promise<{ newlyGranted: boolean }> {
  const { user } = await getCurrentUser();
  if (!user) return { newlyGranted: false };
  const newlyGranted = await grantEasterEggBadge(user.id, 'konami');
  if (newlyGranted) {
    revalidatePath('/profile');
    updateTag(profileCacheTag(user.id));
  }
  return { newlyGranted };
}
