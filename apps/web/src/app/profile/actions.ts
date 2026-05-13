'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';

export type ProfileFormState = {
    error: string | null;
    success: boolean;
};

function clean(value: FormDataEntryValue | null, max: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, max);
}

export async function updateProfile(
    _prev: ProfileFormState,
    formData: FormData,
): Promise<ProfileFormState> {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const firstName = clean(formData.get('first_name'), 60);
    const lastName = clean(formData.get('last_name'), 60);
    const homeCity = clean(formData.get('home_city'), 120);
    const displayNameInput = clean(formData.get('display_name'), 80);

    const fallbackName =
        [firstName, lastName].filter(Boolean).join(' ').trim() ||
        (user.email?.split('@')[0] ?? 'Player');
    const displayName = displayNameInput ?? fallbackName;

    if (!displayName) {
        return { error: 'Please enter a display name (or first/last name).', success: false };
    }

    const { error } = await supabase
        .from('profiles')
        .update({
            first_name: firstName,
            last_name: lastName,
            home_city: homeCity,
            display_name: displayName,
        } as never)
        .eq('id', user.id);

    if (error) {
        return { error: error.message, success: false };
    }

    revalidatePath('/profile');
    revalidatePath('/', 'layout');
    return { error: null, success: true };
}
