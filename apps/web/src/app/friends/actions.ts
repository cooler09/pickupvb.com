'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server-auth';

export async function addFriend(friendId: string, returnPath?: string): Promise<void> {
    if (!friendId) return;
    const { supabase, user } = await requireSession();
    if (friendId === user.id) return;

    await supabase
        .from('friendships')
        .insert({ user_id: user.id, friend_id: friendId } as never);

    if (returnPath) revalidatePath(returnPath);
}

export async function removeFriend(friendId: string, returnPath?: string): Promise<void> {
    if (!friendId) return;
    const { supabase, user } = await requireSession();

    await supabase
        .from('friendships')
        .delete()
        .eq('user_id', user.id)
        .eq('friend_id', friendId);

    if (returnPath) revalidatePath(returnPath);
}
