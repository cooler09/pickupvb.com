'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

async function requireUser() {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login');
    return { supabase, user };
}

export type GroupFormState = {
    error?: string;
    fieldErrors?: Record<string, string>;
};

function s(v: FormDataEntryValue | null): string {
    return (v == null ? '' : String(v)).trim();
}

export async function createGroupAction(
    _prev: GroupFormState,
    formData: FormData,
): Promise<GroupFormState> {
    const { supabase, user } = await requireUser();

    const name = s(formData.get('name'));
    const slug = s(formData.get('slug')).toLowerCase();
    const description = s(formData.get('description'));
    const homeCity = s(formData.get('home_city'));
    const region = s(formData.get('region'));
    const avatarUrl = s(formData.get('avatar_url'));

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
    const { supabase } = await requireUser();

    const name = s(formData.get('name'));
    const description = s(formData.get('description'));
    const homeCity = s(formData.get('home_city'));
    const region = s(formData.get('region'));
    const avatarUrl = s(formData.get('avatar_url'));

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
    const { supabase, user } = await requireUser();
    await supabase
        .from('group_followers')
        .insert({ group_id: groupId, user_id: user.id } as never);
    if (returnPath) revalidatePath(returnPath);
}

export async function unfollowGroup(groupId: string, returnPath?: string): Promise<void> {
    if (!groupId) return;
    const { supabase, user } = await requireUser();
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
    const { supabase } = await requireUser();
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
    const { supabase } = await requireUser();
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
    const { supabase } = await requireUser();
    await supabase
        .from('group_members')
        .update({ role } as never)
        .eq('group_id', groupId)
        .eq('user_id', userId);
    if (returnPath) revalidatePath(returnPath);
}

export async function addEventCoHost(
    eventId: string,
    party: { userId?: string; groupId?: string },
    returnPath?: string,
): Promise<void> {
    if (!eventId || (!party.userId && !party.groupId)) return;
    const { supabase, user } = await requireUser();
    await supabase.from('event_co_hosts').insert({
        event_id: eventId,
        host_user_id: party.userId ?? null,
        host_group_id: party.groupId ?? null,
        added_by: user.id,
    } as never);
    if (returnPath) revalidatePath(returnPath);
}

export async function removeEventCoHost(
    eventId: string,
    party: { userId?: string; groupId?: string },
    returnPath?: string,
): Promise<void> {
    if (!eventId) return;
    const { supabase } = await requireUser();
    let q = supabase.from('event_co_hosts').delete().eq('event_id', eventId);
    if (party.userId) q = q.eq('host_user_id', party.userId);
    if (party.groupId) q = q.eq('host_group_id', party.groupId);
    await q;
    if (returnPath) revalidatePath(returnPath);
}
