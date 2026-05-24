'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server-auth';

export async function followGroup(groupId: string, returnPath?: string): Promise<void> {
  if (!groupId) return;
  const { supabase, user } = await requireSession();
  await supabase.from('group_followers').insert({ group_id: groupId, user_id: user.id } as never);
  if (returnPath) revalidatePath(returnPath);
}

export async function unfollowGroup(groupId: string, returnPath?: string): Promise<void> {
  if (!groupId) return;
  const { supabase, user } = await requireSession();
  await supabase.from('group_followers').delete().eq('group_id', groupId).eq('user_id', user.id);
  if (returnPath) revalidatePath(returnPath);
}
