'use server';

import { revalidatePath } from 'next/cache';
import { fieldOrNull } from '@/lib/form-data';
import { requireSession } from '@/lib/server-auth';

export type ProfileFormState = {
    error: string | null;
    success: boolean;
};

export async function updateProfile(
    _prev: ProfileFormState,
    formData: FormData,
): Promise<ProfileFormState> {
    const { supabase, user } = await requireSession();

    const firstName = fieldOrNull(formData, 'first_name', 60);
    const lastName = fieldOrNull(formData, 'last_name', 60);
    const homeCity = fieldOrNull(formData, 'home_city', 120);
    const displayNameInput = fieldOrNull(formData, 'display_name', 80);
    const autoAcceptTeamInvites = formData.get('auto_accept_team_invites') != null;

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
            auto_accept_team_invites: autoAcceptTeamInvites,
        } as never)
        .eq('id', user.id);

    if (error) {
        return { error: error.message, success: false };
    }

    revalidatePath('/profile');
    revalidatePath('/', 'layout');
    return { error: null, success: true };
}
