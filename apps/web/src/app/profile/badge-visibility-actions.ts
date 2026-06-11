'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { getCurrentUser } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { profileCacheTag } from '@/lib/cache-tags';

/**
 * Owner toggle for trophy-case visibility (gamification Phase 1 — badges audit
 * BA-2). Flips one of the caller's own badges in/out of public display by
 * delegating to the `set_user_badge_hidden` definer RPC, whose `auth.uid()`
 * guard means a user can change visibility but never forge or relabel a
 * badge_key — so this runs on the **user-scoped** client, not the admin one.
 *
 * Bound from the owner trophy case as
 * `setBadgeHidden.bind(null, badgeKey, nextHidden, returnPath)`; the plain
 * `<form action={...}>` delivers the (unused) FormData.
 */
export async function setBadgeHidden(
  badgeKey: string,
  hidden: boolean,
  returnPath: string,
  _formData: FormData,
): Promise<void> {
  const { user } = await getCurrentUser();
  if (!user) return;

  const sb = await getServerSupabase();
  await sb.rpc('set_user_badge_hidden', { p_badge_key: badgeKey, p_hidden: hidden });

  // Owner hub re-renders; the public player page reads the hidden-filtered
  // `user_badges_public` view under the profile cache tag (same eviction pair as
  // the manual-award and easter-egg badge mutations).
  revalidatePath(returnPath);
  updateTag(profileCacheTag(user.id));
}
