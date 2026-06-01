'use server';

import { revalidatePath } from 'next/cache';
import { SetProfileAvatarCommand } from '@pickupvb/application';
import { getServerSupabase } from '@/lib/supabase';
import { getUserProfileHandlers } from '@/lib/handlers';

/**
 * Persists the avatar (profile-picture) URL — or `null` to remove it — for the
 * signed-in user. Upload happens client-side via Supabase Storage (see
 * AvatarUpload); RLS gates the write to the caller's own `{user_id}/…` path
 * prefix. This action only writes the resulting URL to the `profiles` row
 * (through the UserProfile aggregate, ADR 0020 — a self-write under the
 * `id = auth.uid()` RLS policy) and revalidates so the next render picks it up.
 */
export async function saveAvatarUrl(
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
    const { setAvatar } = await getUserProfileHandlers();
    await setAvatar.execute(new SetProfileAvatarCommand(user.id, url));
  } catch {
    return { ok: false, error: 'Save failed.' };
  }

  revalidatePath(returnPath);
  return { ok: true };
}
