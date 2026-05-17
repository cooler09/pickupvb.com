'use server';

import { revalidatePath } from 'next/cache';
import { bool } from '@/lib/form-data';
import { getServerSupabase } from '@/lib/supabase';

type Patch = {
    email_enabled?: boolean;
    push_enabled?: boolean;
    in_app_enabled?: boolean;
};

export async function updateNotificationPreferences(formData: FormData): Promise<void> {
    const supabase = await getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const patch: Patch = {
        email_enabled: bool(formData, 'email_enabled'),
        in_app_enabled: bool(formData, 'in_app_enabled'),
        push_enabled: bool(formData, 'push_enabled'),
    };

    // Upsert — the auth trigger creates a row on signup, but older accounts
    // may pre-date the trigger. Use upsert with user_id as conflict target.
    await supabase
        .from('notification_preferences')
        .upsert(
            { user_id: user.id, ...patch, updated_at: new Date().toISOString() } as never,
            { onConflict: 'user_id' },
        );

    revalidatePath('/profile/notifications');
}
