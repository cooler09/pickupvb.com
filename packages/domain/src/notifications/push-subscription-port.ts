/**
 * Push-subscription persistence port (ADR 0022). `push_subscriptions` stores a
 * user's Web Push endpoints. The cron worker reads them (to fan a push row out
 * to every device) and prunes dead endpoints; the subscribe route writes them
 * (added in a later increment).
 */

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** A subscription the browser registered, owned by a single user. */
export interface PushSubscriptionUpsert {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

export interface PushSubscriptionPort {
  /** Subscriptions for the given users, grouped by user id (worker fan-out). */
  listByUsers(userIds: ReadonlyArray<string>): Promise<Map<string, PushSubscriptionRecord[]>>;
  /** Prune dead endpoints (the push service returned 404/410 — subscription gone). */
  deleteByEndpoints(endpoints: ReadonlyArray<string>): Promise<void>;
  /** Register (or refresh) a user's subscription, deduped by endpoint. */
  upsert(userId: string, sub: PushSubscriptionUpsert): Promise<void>;
  /** Remove a user's own subscription by endpoint (unsubscribe). */
  removeForUser(userId: string, endpoint: string): Promise<void>;
}
