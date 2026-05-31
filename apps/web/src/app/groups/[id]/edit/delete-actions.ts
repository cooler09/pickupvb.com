'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { DeleteGroupCommand } from '@pickupvb/application';
import { ConflictError, NotFoundError, UnauthorizedError } from '@pickupvb/domain';
import { requireRealUser } from '@/lib/server-auth';
import { getGroupHandlers } from '@/lib/handlers';

type State = { error?: string; ok?: boolean };

/**
 * Soft-delete a group. Owner-only (ADR 0021 — enforced by `Group.assertCanDelete`).
 *
 * The handler also refuses if the group is the `host_group_id` of any
 * non-cancelled, future-dated event (those must be reassigned or cancelled
 * first), and performs the `deleted_at` flip via the service-role client — see
 * `getGroupHandlers()` for the RLS-quirk rationale. RLS `groups_select` filters
 * `deleted_at is null`, so the row vanishes from every read path on the next
 * render.
 */
export async function deleteGroupAction(
  groupId: string,
  _prev: State,
  _formData: FormData,
): Promise<State> {
  const { user } = await requireRealUser(`/groups`);

  let slug: string;
  try {
    const { deleteGroup } = await getGroupHandlers();
    const res = await deleteGroup.execute(new DeleteGroupCommand(groupId, user.id));
    slug = res.slug;
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    if (err instanceof ConflictError) return { error: err.message };
    if (err instanceof NotFoundError) return { error: 'Group not found.' };
    throw err;
  }

  revalidatePath('/groups');
  revalidatePath('/profile');
  revalidatePath(`/groups/${slug}`);
  redirect('/groups?deleted=1');
}
