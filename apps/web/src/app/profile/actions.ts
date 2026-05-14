'use server';

import { revalidatePath } from 'next/cache';
import { fieldOrNull } from '@/lib/form-data';
import { isPosition, type Position } from '@/lib/enum-labels';
import { requireSession } from '@/lib/server-auth';

export type ProfileFormState = {
    error: string | null;
    success: boolean;
};

function readPosition(formData: FormData, key: string): Position | null {
    const v = formData.get(key);
    if (typeof v !== 'string' || v.length === 0) return null;
    return isPosition(v) ? v : null;
}

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
    const primaryPosition = readPosition(formData, 'primary_position');
    const secondaryPosition = readPosition(formData, 'secondary_position');
    const tertiaryPosition = readPosition(formData, 'tertiary_position');

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
            primary_position: primaryPosition,
            secondary_position: secondaryPosition,
            tertiary_position: tertiaryPosition,
        } as never)
        .eq('id', user.id);

    if (error) {
        return { error: error.message, success: false };
    }

    revalidatePath('/profile');
    revalidatePath('/', 'layout');
    return { error: null, success: true };
}
