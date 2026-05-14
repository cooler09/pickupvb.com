'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';

export type ClaimState = {
    error?: string;
    fieldErrors?: Record<string, string>;
    info?: string;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Convert the current anonymous session into a permanent account.
 *
 * Supabase preserves the user.id when an anon user calls
 * `auth.updateUser({ email, password })`, so all existing event_attendees /
 * profile rows stay attached. The user gets a confirmation email; once they
 * click the link the `is_anonymous` flag flips to false and they can sign in
 * with email + password from any device.
 */
export async function claimAccount(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    const firstName = String(formData.get('first_name') ?? '').trim();
    const lastName = String(formData.get('last_name') ?? '').trim();

    const fieldErrors: Record<string, string> = {};
    if (!EMAIL_RE.test(email)) fieldErrors.email = 'Enter a valid email address.';
    if (password.length < 8) fieldErrors.password = 'Password must be at least 8 characters.';
    if (Object.keys(fieldErrors).length > 0) {
        return { error: 'Please fix the highlighted fields.', fieldErrors };
    }

    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return { error: 'No active session. Sign up as a guest for an event first.' };
    }
    if (!(user as { is_anonymous?: boolean }).is_anonymous) {
        return { error: 'Your account is already permanent.' };
    }

    const { error } = await supabase.auth.updateUser({
        email,
        password,
        data: {
            ...(firstName ? { first_name: firstName } : {}),
            ...(lastName ? { last_name: lastName } : {}),
        },
    });
    if (error) return { error: error.message };

    // Sync optional names onto the profile row (display_name was already set
    // at guest signup; preserve it unless the user supplied first/last).
    const updates: Record<string, string> = {};
    if (firstName) updates['first_name'] = firstName;
    if (lastName) updates['last_name'] = lastName;
    if (firstName || lastName) {
        updates['display_name'] = [firstName, lastName].filter(Boolean).join(' ');
    }
    if (Object.keys(updates).length > 0) {
        await supabase.from('profiles').update(updates as never).eq('id', user.id);
    }

    revalidatePath('/');
    redirect('/profile?claimed=1');
}
