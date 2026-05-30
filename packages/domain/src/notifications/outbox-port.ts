/**
 * Outbox / fan-out persistence port for the notification subdomain (ADR 0022,
 * architecture audit P2-1 Fix #3).
 *
 * The notification *content* registry (kinds, payload contracts, templates,
 * default channels) lives — pure — in `@pickupvb/notifications`. This is the
 * **write/read side**: the abstraction the dispatcher (`lib/notify.ts`) goes
 * through instead of touching `notification_preferences` / `notifications` /
 * `notification_outbox` raw.
 *
 * `kind` / `channel` are plain `string`s here — they're text columns, and the
 * typed registry is applied at the dispatcher boundary (which keeps `domain`
 * free of a dependency on `@pickupvb/notifications`).
 */

/** A recipient's notification preferences (camelCase read model). */
export interface NotificationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  smsPhone: string | null;
  smsOptedOutAt: string | null;
  /** category → channel → enabled (a per-category, per-channel override). */
  channelOverrides: Record<string, Record<string, boolean>>;
}

/** A queued email / sms / push delivery, drained by the cron worker. */
export interface OutboxMessage {
  userId: string;
  channel: string;
  kind: string;
  toAddress: string;
  payload: Record<string, unknown>;
  /** Per-channel-namespaced dedupe key (e.g. webhook retries). */
  idempotencyKey?: string;
}

/** An in-app notification row (Realtime-pushed to the recipient). */
export interface InAppNotification {
  userId: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  data: Record<string, unknown>;
}

export interface NotificationOutboxPort {
  /** The recipient's preferences, or `null` if no row exists yet. */
  loadPreferences(userId: string): Promise<NotificationPreferences | null>;
  /** The recipient's email (via the auth store), or `null` if unavailable. */
  getUserEmail(userId: string): Promise<string | null>;
  /** Insert an in-app notification. */
  insertInApp(notification: InAppNotification): Promise<void>;
  /** Enqueue an email / sms / push message for the cron worker to deliver. */
  enqueue(message: OutboxMessage): Promise<void>;
}
