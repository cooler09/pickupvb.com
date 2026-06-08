'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { getBadgeDefinition } from '@pickupvb/domain';
import { profileCacheTag } from '@/lib/cache-tags';
import { getCurrentUser } from '@/lib/server-auth';
import { grantEasterEggBadge } from '@/lib/badges';
import { notify } from '@/lib/notify';

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
    const title = getBadgeDefinition('konami')?.title ?? 'Secret';
    await notify('badge.earned', user.id, { badgeTitle: title }).catch(() => undefined);
    revalidatePath('/profile');
    updateTag(profileCacheTag(user.id));
  }
  return { newlyGranted };
}

/**
 * Claim the hidden "Pepper" badge — invoked by the logo tap-streak easter egg
 * in the site header (tap the wordmark 7× fast). Same idempotent, validated,
 * signed-out-safe shape as {@link claimKonamiBadge}; the only difference is the
 * badge key.
 */
export async function claimPepperBadge(): Promise<{ newlyGranted: boolean }> {
  const { user } = await getCurrentUser();
  if (!user) return { newlyGranted: false };
  const newlyGranted = await grantEasterEggBadge(user.id, 'pepper');
  if (newlyGranted) {
    const title = getBadgeDefinition('pepper')?.title ?? 'Secret';
    await notify('badge.earned', user.id, { badgeTitle: title }).catch(() => undefined);
    revalidatePath('/profile');
    updateTag(profileCacheTag(user.id));
  }
  return { newlyGranted };
}
