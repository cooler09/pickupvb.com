'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server-auth';

export async function addGroupMember(
  groupId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
  returnPath?: string,
): Promise<void> {
  if (!groupId || !userId) return;
  const { supabase } = await requireSession();
  await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, role } as never);
  if (returnPath) revalidatePath(returnPath);
}

export async function removeGroupMember(
  groupId: string,
  userId: string,
  returnPath?: string,
): Promise<void> {
  if (!groupId || !userId) return;
  const { supabase } = await requireSession();
  await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
  if (returnPath) revalidatePath(returnPath);
}

export async function changeGroupMemberRole(
  groupId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
  returnPath?: string,
): Promise<void> {
  if (!groupId || !userId) return;
  const { supabase } = await requireSession();
  await supabase
    .from('group_members')
    .update({ role } as never)
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (returnPath) revalidatePath(returnPath);
}
