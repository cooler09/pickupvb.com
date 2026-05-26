'use server';

import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase';

type EntityType = 'events' | 'groups' | 'profiles';

/**
 * Persists a hero image URL (or null to remove) for an event, group, or
 * profile after verifying the caller owns that entity.
 *
 * Upload happens client-side via Supabase Storage (see HeroImageUpload).
 * This action only writes the resulting URL to the DB row and revalidates
 * the appropriate path so the next render picks it up.
 */
export async function saveHeroImageUrl(
  entityType: EntityType,
  entityId: string,
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

  if (entityType === 'events') {
    const { data: event } = await supabase
      .from('events')
      .select('host_id')
      .eq('id', entityId)
      .maybeSingle();
    if (!event) return { ok: false, error: 'Event not found.' };

    if (event.host_id !== user.id) {
      const { data: cohost } = await supabase
        .from('event_co_hosts')
        .select('host_user_id')
        .eq('event_id', entityId)
        .eq('host_user_id', user.id)
        .maybeSingle();
      if (!cohost) return { ok: false, error: 'Not authorized.' };
    }

    const { error } = await supabase
      .from('events')
      .update({ hero_image_url: url })
      .eq('id', entityId);
    if (error) return { ok: false, error: 'Save failed.' };
  } else if (entityType === 'groups') {
    const { data: member } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', entityId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return { ok: false, error: 'Not authorized.' };
    }

    const { error } = await supabase
      .from('groups')
      .update({ hero_image_url: url })
      .eq('id', entityId);
    if (error) return { ok: false, error: 'Save failed.' };
  } else {
    // profiles — users can only update their own
    if (entityId !== user.id) return { ok: false, error: 'Not authorized.' };

    const { error } = await supabase
      .from('profiles')
      .update({ hero_image_url: url })
      .eq('id', entityId);
    if (error) return { ok: false, error: 'Save failed.' };
  }

  revalidatePath(returnPath);
  return { ok: true };
}
