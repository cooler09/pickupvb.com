'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ConflictError, NotFoundError, UnauthorizedError } from '@pickupvb/domain';
import { requireRealUser } from '@/lib/server-auth';
import { getAdminSupabase } from '@/lib/supabase-admin';

type State = { error?: string; ok?: boolean };

/**
 * Soft-delete a group. Owner-only.
 *
 * Refuses if the group is the `host_group_id` of any non-cancelled,
 * future-dated event — those events need to either be reassigned or
 * cancelled first.
 *
 * Flips `groups.deleted_at`. RLS `groups_select` filters
 * `deleted_at is null`, so the row vanishes from every read path on
 * the next render.
 */
export async function deleteGroupAction(
  groupId: string,
  _prev: State,
  _formData: FormData,
): Promise<State> {
  const { user, supabase } = await requireRealUser(`/groups`);

  try {
    const { data: groupRow } = await supabase
      .from('groups')
      .select('id, slug')
      .eq('id', groupId)
      .maybeSingle();
    const group = groupRow as { id: string; slug: string } | null;
    if (!group) throw new NotFoundError('group', groupId);

    // Owner check via group_members.
    const { data: roleRow } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();
    const role = (roleRow as { role: string } | null)?.role;
    if (role !== 'owner') throw new UnauthorizedError('Only the group owner can delete it.');

    // Guard: refuse if any upcoming non-cancelled event hosts under this group.
    const { count } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('host_group_id', groupId)
      .neq('status', 'cancelled')
      .gt('starts_at', new Date().toISOString());
    if ((count ?? 0) > 0) {
      throw new ConflictError(
        'This group is hosting upcoming events. Cancel or reassign them first.',
      );
    }

    // RLS quirk: Postgres applies the SELECT policy as an implicit WITH CHECK
    // on UPDATE, so flipping `deleted_at` through the user-scoped client fails
    // (`groups_select` filters `deleted_at is null`, so the after-image would
    // be invisible to the actor). Owner authorization is already enforced above;
    // bypass RLS for the single-column write.
    const admin = getAdminSupabase();
    const { error: updErr } = await admin
      .from('groups')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', groupId);
    if (updErr) return { error: updErr.message };

    revalidatePath('/groups');
    revalidatePath('/profile');
    revalidatePath(`/groups/${group.slug}`);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    if (err instanceof ConflictError) return { error: err.message };
    if (err instanceof NotFoundError) return { error: 'Group not found.' };
    throw err;
  }

  redirect('/groups?deleted=1');
}
