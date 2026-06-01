'use server';

import { revalidatePath } from 'next/cache';
import { SetGroupAvatarCommand } from '@pickupvb/application';
import { getServerSupabase } from '@/lib/supabase';
import { getGroupHandlers } from '@/lib/handlers';

/**
 * Persists the group avatar (logo) URL — or `null` to remove it. The upload
 * happens client-side via Supabase Storage (see AvatarUpload); the `avatars`
 * bucket RLS gates the write to the caller's own `{user_id}/…` path prefix.
 * This action only writes the resulting URL to `groups.avatar_url` through the
 * Group aggregate — the `groups_update` RLS policy (owner/admin) on the
 * user-scoped client (`getGroupHandlers`) is the real authorization gate
 * (AGENTS.md pitfall #8); the group edit page additionally gates access to
 * owners/admins. Revalidates so the next render picks the new avatar up.
 */
export async function saveGroupAvatarUrl(
  groupId: string,
  url: string | null,
  returnPath: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if ((user as { is_anonymous?: boolean }).is_anonymous) {
    return { ok: false, error: 'Finish creating your account first.' };
  }

  try {
    const { setGroupAvatar } = await getGroupHandlers();
    await setGroupAvatar.execute(new SetGroupAvatarCommand(groupId, url));
  } catch {
    return { ok: false, error: 'Save failed.' };
  }

  revalidatePath(returnPath);
  return { ok: true };
}
