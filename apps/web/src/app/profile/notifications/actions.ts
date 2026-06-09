'use server';

import { revalidatePath } from 'next/cache';
import { SupabaseNotificationPreferencesRepository } from '@pickupvb/infrastructure';
import type { NotificationChannelOverrides } from '@pickupvb/domain';
import { bool } from '@/lib/form-data';
import { getServerSupabase } from '@/lib/supabase';
import { categoryRows, overrideFieldName } from './categories';

/**
 * Rebuild the per-category overrides from the matrix. A checkbox only submits
 * when checked, so we iterate the same (category, channel) set the page
 * rendered and record only the *unchecked* cells as `false` — an override can
 * only subtract from the master toggle, and storing just the `false` entries
 * keeps the JSON minimal (matches what `channelAllowedByPrefs` reads).
 */
function readChannelOverrides(formData: FormData): NotificationChannelOverrides {
  const overrides: NotificationChannelOverrides = {};
  for (const row of categoryRows()) {
    for (const channel of row.channels) {
      if (!bool(formData, overrideFieldName(row.category, channel))) {
        (overrides[row.category] ??= {})[channel] = false;
      }
    }
  }
  return overrides;
}

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
      channelOverrides: readChannelOverrides(formData),
    });
  } catch {
    // ignore — preserve the prior fire-and-forget behavior
  }

  revalidatePath('/profile/notifications');
}
