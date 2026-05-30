import type {
  InAppNotification,
  NotificationOutboxPort,
  NotificationPreferences,
  OutboxMessage,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

type PrefsRow = {
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  sms_phone: string | null;
  sms_opted_out_at: string | null;
  channel_overrides: Record<string, Record<string, boolean>> | null;
};

/**
 * Supabase adapter for the notification outbox / fan-out (ADR 0022).
 *
 * Runs on the **service-role** client — notification dispatch is a session-less
 * fan-out (the sanctioned admin-client case, AGENTS.md pitfall #8). It's
 * client-injected so the caller (`lib/notify.ts`) constructs it with the admin
 * client explicitly, keeping the privileged context visible at the boundary.
 */
export class SupabaseNotificationOutboxRepository implements NotificationOutboxPort {
  constructor(private readonly admin: SupabaseClient) {}

  async loadPreferences(userId: string): Promise<NotificationPreferences | null> {
    const { data, error } = await this.admin
      .from('notification_preferences')
      .select(
        'email_enabled, sms_enabled, push_enabled, in_app_enabled, sms_phone, sms_opted_out_at, channel_overrides',
      )
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`loadPreferences failed: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as PrefsRow;
    return {
      emailEnabled: row.email_enabled,
      smsEnabled: row.sms_enabled,
      pushEnabled: row.push_enabled,
      inAppEnabled: row.in_app_enabled,
      smsPhone: row.sms_phone,
      smsOptedOutAt: row.sms_opted_out_at,
      channelOverrides: row.channel_overrides ?? {},
    };
  }

  async getUserEmail(userId: string): Promise<string | null> {
    const { data, error } = await this.admin.auth.admin.getUserById(userId);
    if (error) return null;
    return data?.user?.email ?? null;
  }

  async insertInApp(notification: InAppNotification): Promise<void> {
    const { error } = await this.admin.from('notifications').insert({
      user_id: notification.userId,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      href: notification.href,
      data: notification.data,
    } as never);
    if (error) throw new Error(`insertInApp failed: ${error.message}`);
  }

  async enqueue(message: OutboxMessage): Promise<void> {
    const { error } = await this.admin.from('notification_outbox').insert({
      user_id: message.userId,
      channel: message.channel,
      kind: message.kind,
      to_address: message.toAddress,
      payload: message.payload,
      ...(message.idempotencyKey ? { idempotency_key: message.idempotencyKey } : {}),
    } as never);
    if (error) throw new Error(`enqueue failed: ${error.message}`);
  }
}
