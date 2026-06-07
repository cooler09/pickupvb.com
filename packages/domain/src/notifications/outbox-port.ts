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
  /**
   * Enqueue email / sms / push messages for the cron worker to deliver, in a
   * single insert. Batched so one `dispatch()` fan-out fires one DB "kick" of
   * the worker (ADR 0026), not one per channel. A no-op for an empty array.
   */
  enqueue(messages: OutboxMessage[]): Promise<void>;
}

/** A claimed outbox row, handed to the worker for delivery. */
export interface OutboxRecord {
  id: string;
  /** Recipient user id — used by the worker to mint a per-user
   * `List-Unsubscribe` token for non-transactional email. */
  userId: string;
  channel: string;
  kind: string;
  toAddress: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/** A delivery failure outcome from the worker. `retryAt = null` gives up
 * (marks the row terminally failed); a value reschedules it (status pending). */
export interface OutboxFailure {
  attempts: number;
  lastError: string;
  retryAt: string | null;
}

/**
 * Drain side of the outbox (the cron worker + purge). Segregated from the
 * enqueue-side `NotificationOutboxPort` (ISP) — delivery callers only enqueue,
 * the worker only claims/completes. The same adapter implements both.
 */
export interface NotificationOutboxDrainPort {
  /** Claim up to `limit` due `pending` rows (flips them to `sending`). */
  claimBatch(limit: number): Promise<OutboxRecord[]>;
  /** Mark a row delivered (optionally recording the provider's message id). */
  markSent(id: string, providerId?: string): Promise<void>;
  /** Mark a row intentionally not delivered (sms-not-wired, no push subs, …). */
  markSkipped(id: string, reason: string): Promise<void>;
  /** Record a delivery failure — reschedule with backoff, or give up. */
  markFailed(id: string, failure: OutboxFailure): Promise<void>;
  /** Purge terminal (`sent`/`skipped`) rows whose `sent_at` predates the cutoff. */
  purgeTerminal(sentBefore: string): Promise<number>;
  /** Purge `failed` rows whose `created_at` predates the cutoff. */
  purgeFailed(createdBefore: string): Promise<number>;
}
