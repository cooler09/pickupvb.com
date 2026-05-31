'use server';

import { revalidatePath } from 'next/cache';
import { FollowGroupCommand, UnfollowGroupCommand } from '@pickupvb/application';
import { requireSession } from '@/lib/server-auth';
import { getGroupHandlers } from '@/lib/handlers';

/**
 * Follow / unfollow run via plain `<form action={…}>` submissions in a client
 * island with no client-side error handling. They are best-effort — the
 * idempotent edge write never blocks the UI — so failures are swallowed
 * (matching the prior raw `insert`/`delete` that ignored its error result).
 */
export async function followGroup(groupId: string, returnPath?: string): Promise<void> {
  if (!groupId) return;
  const { user } = await requireSession();
  try {
    const { followGroup: handler } = await getGroupHandlers();
    await handler.execute(new FollowGroupCommand(groupId, user.id));
  } catch {
    return;
  }
  if (returnPath) revalidatePath(returnPath);
}

export async function unfollowGroup(groupId: string, returnPath?: string): Promise<void> {
  if (!groupId) return;
  const { user } = await requireSession();
  try {
    const { unfollowGroup: handler } = await getGroupHandlers();
    await handler.execute(new UnfollowGroupCommand(groupId, user.id));
  } catch {
    return;
  }
  if (returnPath) revalidatePath(returnPath);
}
