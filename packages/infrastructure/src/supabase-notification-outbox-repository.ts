import type {
  InAppNotification,
  NotificationOutboxDrainPort,
  NotificationOutboxPort,
  NotificationPreferences,
  OutboxFailure,
  OutboxMessage,
  OutboxRecord,
} from '@pickupvb/domain';
import type { createSupabaseAdminClient } from '@pickupvb/supabase';
import { asJson } from './supabase-json.js';

type SupabaseClient = ReturnType<typeof createSupabaseAdminClient>;

const CLAIM_COLUMNS = 'id, user_id, channel, kind, to_address, payload, attempts';

/**
 * Claim lease (notifications audit P2 #7). On claim a row's `scheduled_for` is
 * pushed this far into the future, so a concurrent worker won't re-claim a row
 * that's actively being delivered. If the worker dies before writing a terminal
 * status (the 60s `maxDuration` hard-kills it mid-batch, a throw, a cold-stop),
 * the lease lapses and the next sweep re-claims the orphaned `sending` row
 * instead of stranding it forever. 5 min ≫ the worker's 60s ceiling, so an
 * in-flight row can never be double-claimed.
 */
const CLAIM_LEASE_MS = 5 * 60 * 1000;

type OutboxRow = {
  id: string;
  user_id: string;
  channel: string;
  kind: string;
  to_address: string;
  payload: Record<string, unknown>;
  attempts: number;
};

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
export class SupabaseNotificationOutboxRepository
  implements NotificationOutboxPort, NotificationOutboxDrainPort
{
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
      data: asJson(notification.data),
    });
    if (error) throw new Error(`insertInApp failed: ${error.message}`);
  }

  async enqueue(messages: OutboxMessage[]): Promise<void> {
    if (messages.length === 0) return;
    // One insert for the whole batch → the AFTER INSERT statement-level trigger
    // (ADR 0026) fires a single worker kick, not one per row.
    const rows = messages.map((message) => ({
      user_id: message.userId,
      channel: message.channel,
      kind: message.kind,
      to_address: message.toAddress,
      payload: asJson(message.payload),
      ...(message.idempotencyKey ? { idempotency_key: message.idempotencyKey } : {}),
    }));
    const { error } = await this.admin.from('notification_outbox').insert(rows);
    if (error) throw new Error(`enqueue failed: ${error.message}`);
  }

  // ---- Drain side (cron worker + purge) -------------------------------------

  async claimBatch(limit: number): Promise<OutboxRecord[]> {
    // Claim by flipping due rows to `sending` and stamping a lease into
    // `scheduled_for`. Two row sets are due: fresh `pending` rows, and `sending`
    // rows whose lease has lapsed — i.e. a prior claim whose worker died before
    // writing a terminal status (audit P2 #7). Re-claiming the latter is what
    // stops a crash/timeout from orphaning rows in `sending` forever; the lease
    // (set below) is what keeps a concurrent worker from grabbing a row that's
    // still in flight. A perpetually-timing-out row keeps its `attempts` (the
    // increment only happens in markFailed), so it re-leases rather than burning
    // a retry — acceptable, since a constant timeout is a systemic fault, not a
    // poison row. Not a real SKIP LOCKED — for our volumes the race is fine.
    const now = new Date();
    const lease = new Date(now.getTime() + CLAIM_LEASE_MS).toISOString();
    const { data, error } = await this.admin
      .from('notification_outbox')
      .update({ status: 'sending', scheduled_for: lease })
      .in('status', ['pending', 'sending'])
      .lte('scheduled_for', now.toISOString())
      .select(CLAIM_COLUMNS)
      .limit(limit);
    if (error) throw new Error(`claimBatch failed: ${error.message}`);
    return ((data as unknown as OutboxRow[] | null) ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      channel: r.channel,
      kind: r.kind,
      toAddress: r.to_address,
      payload: r.payload,
      attempts: r.attempts,
    }));
  }

  async markSent(id: string, providerId?: string): Promise<void> {
    const { error } = await this.admin
      .from('notification_outbox')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        ...(providerId ? { provider_id: providerId } : {}),
      })
      .eq('id', id);
    if (error) throw new Error(`markSent failed: ${error.message}`);
  }

  async markSkipped(id: string, reason: string): Promise<void> {
    const { error } = await this.admin
      .from('notification_outbox')
      .update({ status: 'skipped', last_error: reason })
      .eq('id', id);
    if (error) throw new Error(`markSkipped failed: ${error.message}`);
  }

  async markFailed(id: string, failure: OutboxFailure): Promise<void> {
    const { error } = await this.admin
      .from('notification_outbox')
      .update({
        status: failure.retryAt ? 'pending' : 'failed',
        attempts: failure.attempts,
        last_error: failure.lastError,
        ...(failure.retryAt ? { scheduled_for: failure.retryAt } : {}),
      })
      .eq('id', id);
    if (error) throw new Error(`markFailed failed: ${error.message}`);
  }

  async purgeTerminal(sentBefore: string): Promise<number> {
    const { count, error } = await this.admin
      .from('notification_outbox')
      .delete({ count: 'exact' })
      .in('status', ['sent', 'skipped'])
      .lt('sent_at', sentBefore);
    if (error) throw new Error(`purgeTerminal failed: ${error.message}`);
    return count ?? 0;
  }

  async purgeFailed(createdBefore: string): Promise<number> {
    const { count, error } = await this.admin
      .from('notification_outbox')
      .delete({ count: 'exact' })
      .eq('status', 'failed')
      .lt('created_at', createdBefore);
    if (error) throw new Error(`purgeFailed failed: ${error.message}`);
    return count ?? 0;
  }
}
