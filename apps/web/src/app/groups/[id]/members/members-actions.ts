'use server';

import { field } from '@/lib/form-data';
import { addGroupMember } from '@/app/groups/member-actions';

/**
 * Server action wrapper that adapts the "Add member" plain HTML form's
 * FormData (user_id, role) into the typed `addGroupMember` call. Bound at
 * the call site with the group id and a return path.
 */
export async function addMemberFromForm(
  groupId: string,
  returnPath: string,
  formData: FormData,
): Promise<void> {
  const userId = field(formData, 'user_id');
  const role = (field(formData, 'role') || 'member') as 'owner' | 'admin' | 'member';
  if (!userId) return;
  await addGroupMember(groupId, userId, role, returnPath);
}
