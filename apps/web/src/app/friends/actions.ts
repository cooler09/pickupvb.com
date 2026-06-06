'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { AddFriendCommand, RemoveFriendCommand } from '@pickupvb/application';
import { requireSession } from '@/lib/server-auth';
import { getUserProfileHandlers } from '@/lib/handlers';
import { notifyNewFollower } from '@/lib/notify-follow';

export async function addFriend(friendId: string, returnPath?: string): Promise<void> {
  if (!friendId) return;
  const { user } = await requireSession();
  if (friendId === user.id) return;

  const { addFriend: handler } = await getUserProfileHandlers();
  await handler.execute(new AddFriendCommand(user.id, friendId));

  // Ping the followed user's bell after the response is sent, so the notify
  // fan-out never adds latency to the follow. Best-effort inside.
  const ping = notifyNewFollower({ followerId: user.id, followedId: friendId });
  try {
    after(ping);
  } catch {
    // No request scope (e.g. unit tests) — let it run as a floating promise.
    void ping;
  }

  if (returnPath) revalidatePath(returnPath);
}

export async function removeFriend(friendId: string, returnPath?: string): Promise<void> {
  if (!friendId) return;
  const { user } = await requireSession();

  const { removeFriend: handler } = await getUserProfileHandlers();
  await handler.execute(new RemoveFriendCommand(user.id, friendId));

  if (returnPath) revalidatePath(returnPath);
}

/**
 * FormData adapter for `<form action=…>` submissions. Reads `friend_id`
 * from the form (set by the UserPicker hidden input) and delegates to the
 * typed action above. Bound at the call site:
 *   addFriendFromForm.bind(null, returnPath)
 */
export async function addFriendFromForm(returnPath: string, formData: FormData): Promise<void> {
  const id = String(formData.get('friend_id') ?? '').trim();
  if (!id) return;
  await addFriend(id, returnPath);
}
