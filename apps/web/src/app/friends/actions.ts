'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';

async function requireUser() {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login');
    return { supabase, user };
}

export async function addFriend(friendId: string, returnPath?: string): Promise<void> {
    if (!friendId) return;
    const { supabase, user } = await requireUser();
    if (friendId === user.id) return;

    await supabase
        .from('friendships')
        .insert({ user_id: user.id, friend_id: friendId } as never);

    if (returnPath) revalidatePath(returnPath);
}

export async function removeFriend(friendId: string, returnPath?: string): Promise<void> {
    if (!friendId) return;
    const { supabase, user } = await requireUser();

    await supabase
        .from('friendships')
        .delete()
        .eq('user_id', user.id)
        .eq('friend_id', friendId);

    if (returnPath) revalidatePath(returnPath);
}
