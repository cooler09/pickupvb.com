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

    // Supabase recommends splitting the anon → permanent conversion into two
    // separate updateUser calls. Setting email + password together on an anon
    // user occasionally returns a misleading `Email address "" is invalid`
    // because the new email is queued for confirmation and the password-set
    // path validates against the (still-empty) confirmed email.
    //
    // Step 1: set the password and any optional metadata. This makes the
    // account usable with email + password as soon as the email confirms.
    const { error: pwErr } = await supabase.auth.updateUser({
        password,
        data: {
            ...(firstName ? { first_name: firstName } : {}),
            ...(lastName ? { last_name: lastName } : {}),
        },
    });
    if (pwErr) {
        console.error('[claim] updateUser(password) failed:', pwErr);
        return { error: pwErr.message };
    }

    // Step 2: set the email. Supabase emails the user a confirmation link —
    // until they click it the address stays pending and is_anonymous remains
    // true, but the password set above lets them sign in once confirmed.
    const { error: emailErr } = await supabase.auth.updateUser({ email });
    if (emailErr) {
        console.error('[claim] updateUser(email) failed:', emailErr, 'email=', JSON.stringify(email));
        return { error: emailErr.message };
    }

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
    redirect('/profile?claimed=1&pending_email=1');
}
