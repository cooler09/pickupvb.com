'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase';

export type GuestSignupState = {
    error?: string;
    fieldErrors?: Record<string, string>;
};

function s(v: FormDataEntryValue | null): string {
    return (v == null ? '' : String(v)).trim();
}

function emptyToNull(v: string): string | null {
    return v.length === 0 ? null : v;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function signupAsGuest(
    eventId: string,
    _prev: GuestSignupState,
    formData: FormData,
): Promise<GuestSignupState> {
    const supabase = getServerSupabase();

    const displayName = s(formData.get('display_name'));
    const email = s(formData.get('email'));
    const phone = s(formData.get('phone'));
    const notes = s(formData.get('notes'));

    const fieldErrors: Record<string, string> = {};
    if (displayName.length < 1 || displayName.length > 80) {
        fieldErrors.display_name = 'Name is required (1–80 characters).';
    }
    if (email.length > 0 && !EMAIL_RE.test(email)) {
        fieldErrors.email = 'That email address looks invalid.';
    }
    if (phone.length > 0 && (phone.length < 3 || phone.length > 40)) {
        fieldErrors.phone = 'Phone must be 3–40 characters.';
    }
    if (notes.length > 500) {
        fieldErrors.notes = 'Notes must be 500 characters or less.';
    }
    if (Object.keys(fieldErrors).length > 0) {
        return { error: 'Please fix the highlighted fields.', fieldErrors };
    }

    const { data, error } = await supabase
        .from('event_guests')
        .insert({
            event_id: eventId,
            display_name: displayName,
            email: emptyToNull(email),
            phone: emptyToNull(phone),
            notes: emptyToNull(notes),
        } as never)
        .select('id, cancel_token')
        .single();

    if (error) {
        // Friendly message for the unique-name and full-event cases.
        if (error.code === '23505') {
            return {
                error: 'Someone already signed up under that name. Try adding a last initial.',
                fieldErrors: { display_name: 'Already taken for this event.' },
            };
        }
        if (/full/i.test(error.message)) {
            return { error: 'This event is full.' };
        }
        return { error: error.message };
    }

    const created = data as { id: string; cancel_token: string };
    revalidatePath(`/events/${eventId}`);
    redirect(`/events/${eventId}/joined?gid=${created.id}&t=${created.cancel_token}`);
}

export async function cancelGuestSignup(
    eventId: string,
    token: string,
): Promise<void> {
    if (!token) return;
    const supabase = getServerSupabase();
    await supabase.rpc('cancel_guest_signup', { p_token: token } as never);
    revalidatePath(`/events/${eventId}`);
    redirect(`/events/${eventId}`);
}
