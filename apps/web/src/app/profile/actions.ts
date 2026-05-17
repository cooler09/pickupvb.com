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
    const showProBadge = formData.get('show_pro_badge') != null;
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
            show_pro_badge: showProBadge,
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

export type HandleFormState = {
    error: string | null;
    success: boolean;
};

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,63}[a-z0-9]$/;

export async function updateHandle(
    _prev: HandleFormState,
    formData: FormData,
): Promise<HandleFormState> {
    const { supabase, user } = await requireSession();

    const raw = String(formData.get('handle') ?? '').trim().toLowerCase();
    if (!raw) return { error: 'Pick a handle.', success: false };
    if (!HANDLE_RE.test(raw)) {
        return {
            error: 'Use 3–65 lowercase letters, numbers, or dashes (no leading/trailing dash).',
            success: false,
        };
    }

    // Look up old handle so we can revalidate its public URL too.
    const { data: oldRow } = await supabase
        .from('profiles')
        .select('handle')
        .eq('id', user.id)
        .maybeSingle();
    const oldHandle = (oldRow as { handle: string } | null)?.handle ?? null;

    const { error } = await supabase
        .from('profiles')
        .update({ handle: raw } as never)
        .eq('id', user.id);

    if (error) {
        if (error.code === '23505') {
            return { error: 'That handle is already taken — try another.', success: false };
        }
        return { error: error.message, success: false };
    }

    revalidatePath('/profile');
    revalidatePath(`/players/${raw}`);
    if (oldHandle && oldHandle !== raw) revalidatePath(`/players/${oldHandle}`);
    return { error: null, success: true };
}
