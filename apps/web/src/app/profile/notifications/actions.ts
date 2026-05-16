'use server';

import { revalidatePath } from 'next/cache';
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
        email_enabled: formData.get('email_enabled') === 'on',
        in_app_enabled: formData.get('in_app_enabled') === 'on',
        push_enabled: formData.get('push_enabled') === 'on',
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
