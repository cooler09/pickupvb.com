'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { field } from '@/lib/form-data';
import { requireSession } from '@/lib/server-auth';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export type GroupFormState = {
    error?: string;
    fieldErrors?: Record<string, string>;
};

export async function createGroupAction(
    _prev: GroupFormState,
    formData: FormData,
): Promise<GroupFormState> {
    const { supabase, user } = await requireSession();

    const name = field(formData, 'name');
    const slug = field(formData, 'slug').toLowerCase();
    const description = field(formData, 'description');
    const homeCity = field(formData, 'home_city');
    const region = field(formData, 'region');
    const avatarUrl = field(formData, 'avatar_url');

    const fieldErrors: Record<string, string> = {};
    if (name.length < 1 || name.length > 80) fieldErrors.name = 'Name is required (1–80 chars).';
    if (!SLUG_RE.test(slug))
        fieldErrors.slug = 'Slug must be 3–40 chars, lowercase letters, numbers, dashes.';
    if (Object.keys(fieldErrors).length > 0)
        return { error: 'Please fix the highlighted fields.', fieldErrors };

    const { data, error } = await supabase
        .from('groups')
        .insert({
            slug,
            name,
            description,
            home_city: homeCity || null,
            region: region || null,
            avatar_url: avatarUrl || null,
            created_by: user.id,
        } as never)
        .select('id, slug')
        .single();

    if (error) {
        if (error.code === '23505') return { error: 'That slug is taken — pick another.', fieldErrors: { slug: 'Already taken.' } };
        return { error: error.message };
    }

    const created = data as { id: string; slug: string };
    revalidatePath('/groups');
    revalidatePath('/profile');
    redirect(`/groups/${created.id}`);
}

export async function updateGroupAction(
    groupId: string,
    _prev: GroupFormState,
    formData: FormData,
): Promise<GroupFormState> {
    const { supabase } = await requireSession();

    const name = field(formData, 'name');
    const description = field(formData, 'description');
    const homeCity = field(formData, 'home_city');
    const region = field(formData, 'region');
    const avatarUrl = field(formData, 'avatar_url');

    const fieldErrors: Record<string, string> = {};
    if (name.length < 1 || name.length > 80) fieldErrors.name = 'Name is required (1–80 chars).';
    if (Object.keys(fieldErrors).length > 0)
        return { error: 'Please fix the highlighted fields.', fieldErrors };

    const { error } = await supabase
        .from('groups')
        .update({
            name,
            description,
            home_city: homeCity || null,
            region: region || null,
            avatar_url: avatarUrl || null,
            updated_at: new Date().toISOString(),
        } as never)
        .eq('id', groupId);

    if (error) return { error: error.message };

    revalidatePath(`/groups/${groupId}`);
    return {};
}

export async function followGroup(groupId: string, returnPath?: string): Promise<void> {
    if (!groupId) return;
    const { supabase, user } = await requireSession();
    await supabase
        .from('group_followers')
        .insert({ group_id: groupId, user_id: user.id } as never);
    if (returnPath) revalidatePath(returnPath);
}

export async function unfollowGroup(groupId: string, returnPath?: string): Promise<void> {
    if (!groupId) return;
    const { supabase, user } = await requireSession();
    await supabase
        .from('group_followers')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', user.id);
    if (returnPath) revalidatePath(returnPath);
}

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
    await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);
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
