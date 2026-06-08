import type {
  NotificationChannelToggles,
  NotificationPreferenceSettings,
  NotificationPreferencesPort,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

const SETTINGS_COLUMNS =
  'email_enabled, sms_enabled, push_enabled, in_app_enabled, sms_phone, sms_opted_in_at, channel_overrides';

type SettingsRow = {
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  sms_phone: string | null;
  sms_opted_in_at: string | null;
  channel_overrides: Record<string, Record<string, boolean>> | null;
};

/**
 * Supabase adapter for the notification-preferences **settings** surface
 * (ADR 0022). Client-injected and used with the viewer's session client so RLS
 * scopes the read/upsert to their own row.
 */
export class SupabaseNotificationPreferencesRepository implements NotificationPreferencesPort {
  constructor(private readonly client: SupabaseClient) {}

  async find(userId: string): Promise<NotificationPreferenceSettings | null> {
    const { data, error } = await this.client
      .from('notification_preferences')
      .select(SETTINGS_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`NotificationPreferences.find failed: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as SettingsRow;
    return {
      emailEnabled: row.email_enabled,
      smsEnabled: row.sms_enabled,
      pushEnabled: row.push_enabled,
      inAppEnabled: row.in_app_enabled,
      smsPhone: row.sms_phone,
      smsOptedInAt: row.sms_opted_in_at,
      channelOverrides: row.channel_overrides ?? {},
    };
  }

  async upsertChannels(userId: string, toggles: NotificationChannelToggles): Promise<void> {
    const { error } = await this.client.from('notification_preferences').upsert(
      {
        user_id: userId,
        email_enabled: toggles.emailEnabled,
        push_enabled: toggles.pushEnabled,
        in_app_enabled: toggles.inAppEnabled,
        // Only written when the form supplies it, so callers that toggle only
        // the master channels don't clobber stored per-category opt-outs.
        ...(toggles.channelOverrides ? { channel_overrides: toggles.channelOverrides } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw new Error(`NotificationPreferences.upsertChannels failed: ${error.message}`);
  }
}
