'use server';

import { revalidatePath } from 'next/cache';
import { SupabaseNotificationPreferencesRepository } from '@pickupvb/infrastructure';
import { bool } from '@/lib/form-data';
import { getServerSupabase } from '@/lib/supabase';

export async function updateNotificationPreferences(formData: FormData): Promise<void> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Best-effort save (matches the prior behavior of ignoring the write error);
  // the upsert covers older accounts whose row pre-dates the signup trigger.
  try {
    await new SupabaseNotificationPreferencesRepository(supabase).upsertChannels(user.id, {
      emailEnabled: bool(formData, 'email_enabled'),
      inAppEnabled: bool(formData, 'in_app_enabled'),
      pushEnabled: bool(formData, 'push_enabled'),
    });
  } catch {
    // ignore — preserve the prior fire-and-forget behavior
  }

  revalidatePath('/profile/notifications');
}
