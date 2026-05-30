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

export interface PushSubscriptionPort {
  /** Subscriptions for the given users, grouped by user id (worker fan-out). */
  listByUsers(userIds: ReadonlyArray<string>): Promise<Map<string, PushSubscriptionRecord[]>>;
  /** Prune dead endpoints (the push service returned 404/410 — subscription gone). */
  deleteByEndpoints(endpoints: ReadonlyArray<string>): Promise<void>;
}
