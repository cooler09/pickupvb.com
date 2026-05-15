'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { field } from '@/lib/form-data';
import { getViewer } from '@/lib/server-auth';

export type ClaimState = {
    error?: string;
    fieldErrors?: Record<string, string>;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Convert the current anonymous session into a permanent account.
 *
 * GoTrue requires that an anon user gets an email (or phone) BEFORE a
 * password can be set:
 *   "Updating password of an anonymous user without an email or phone is
 *   not allowed"
 *
 * So the conversion is two events, with the user clicking through email in
 * between:
 *   1. (here) updateUser({ email }) — Supabase sends a confirmation link.
 *      `is_anonymous` stays true until they click it.
 *   2. (after they click the link) /auth/callback exchanges the code for a
 *      session whose `is_anonymous` is now false. From there we send them to
 *      /reset-password to set their password.
 *
 * First/last name are saved to user metadata + profiles immediately — they
 * don't depend on email confirmation.
 */
export async function claimAccount(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
    const email = field(formData, 'email');
    const firstName = field(formData, 'first_name');
    const lastName = field(formData, 'last_name');

    const fieldErrors: Record<string, string> = {};
    if (!EMAIL_RE.test(email)) fieldErrors.email = 'Enter a valid email address.';
    if (Object.keys(fieldErrors).length > 0) {
        return { error: 'Please fix the highlighted fields.', fieldErrors };
    }

    const viewer = await getViewer();
    if (!viewer) {
        return { error: 'No active session. Sign up as a guest for an event first.' };
    }
    if (!viewer.isAnonymous) {
        return { error: 'Your account is already permanent.' };
    }
    const { supabase, user } = viewer;

    // Step 1: stash the names in user_metadata + profiles. Doesn't require
    // email/phone, so it's safe to do pre-confirmation.
    if (firstName || lastName) {
        const { error: metaErr } = await supabase.auth.updateUser({
            data: {
                ...(firstName ? { first_name: firstName } : {}),
                ...(lastName ? { last_name: lastName } : {}),
            },
        });
        if (metaErr) {
            console.error('[claim] updateUser(metadata) failed:', metaErr);
        }

        const updates: Record<string, string> = {
            display_name: [firstName, lastName].filter(Boolean).join(' '),
        };
        if (firstName) updates['first_name'] = firstName;
        if (lastName) updates['last_name'] = lastName;
        await supabase.from('profiles').update(updates as never).eq('id', user.id);
    }

    // Step 2: attach the email. Supabase sends a confirmation link; until the
    // user clicks it the email stays in `email_change` and `is_anonymous`
    // stays true. The user CANNOT set a password until after confirmation —
    // emailRedirectTo sends them through /auth/callback to /reset-password.
    const h = await headers();
    const origin =
        h.get('origin') ??
        (h.get('host') ? `https://${h.get('host')}` : 'http://localhost:3000');
    const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
        '/reset-password?from=claim',
    )}`;

    const { error: emailErr } = await supabase.auth.updateUser(
        { email },
        { emailRedirectTo },
    );
    if (emailErr) {
        console.error('[claim] updateUser(email) failed:', emailErr, 'email=', JSON.stringify(email));
        return { error: emailErr.message };
    }

    revalidatePath('/');
    redirect(`/claim/check-email?to=${encodeURIComponent(email)}`);
}
