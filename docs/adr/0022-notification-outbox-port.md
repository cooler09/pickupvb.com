# 0022. `NotificationOutboxPort` — draining the notification subdomain

- **Status:** Accepted
- **Date:** 2026-05-29
- **Relates to:** [ADR 0001 — Hexagonal architecture with CQRS-lite](0001-hexagonal-cqrs.md), [ADR 0020 — UserProfile write aggregate](0020-user-profile-write-aggregate.md), [ADR 0021 — Group aggregate + repository](0021-group-aggregate-and-repository.md)
- **Addresses:** [architecture audit P2-1 (2026-05-29) — web layer bypasses the hexagonal boundary](../audits/architecture.md#p2-1-web-layer-bypasses-the-hexagonal-boundary-76-files-of-raw-supabasefrom--highest-roi-finding-) (Fix #3 — the notification outbox)

## Context

P2-1 Fix #3 calls for "a `NotificationOutboxPort` for `notification_outbox` /
`broadcasts` / `push_subscriptions` fan-out." After Phases 2–3 drained
profiles/friendships and groups, the notification subdomain is the last big
cluster of raw `supabase.from(...)` in the web layer — ~25 hits across
`lib/notify.ts`, the cron routes (`worker`, `outbox-purge`, `subscribe`,
`reminders`), the broadcast actions, and the prefs page.

This subdomain is **infrastructure-heavy, not a rich aggregate**: the notification
_content_ model (kinds, payload contracts, templates, default channels,
category→preference mapping) already lives — pure — in `@pickupvb/notifications`.
What leaks is the **write/read plumbing**: enqueuing outbox rows, inserting
in-app notifications, loading preferences, the cron drain/purge, the broadcast
rows, and push subscriptions.

The most-reused, highest-value piece is the **fan-out** in
[lib/notify.ts](../../apps/web/src/lib/notify.ts) — the single entry point every
trigger calls. It runs on the **service-role admin client** (a session-less
fan-out — the sanctioned admin-client case in AGENTS.md pitfall #8), loads the
recipient's `notification_preferences`, looks up their email via the Supabase
Auth admin API, computes channels (intersecting kind defaults with prefs;
transactional kinds bypass), then inserts into `notifications` (in-app) or
`notification_outbox` (email/sms/push). It's **best-effort** — it logs and
swallows so a notification failure can't break the caller's mutation. That
"silent in prod" property is exactly why it deserves a test seam.

## Decision

**Introduce a `NotificationOutboxPort` (the write/read persistence abstraction
for the outbox) and route `notify()` through it. Migrate the rest of the
subdomain (worker, purge, broadcasts, subscriptions, prefs) behind the same or
sibling ports incrementally.**

### 1. Port placement — `@pickupvb/domain`, plain-string kind/channel

The port lives in `@pickupvb/domain` (`notifications/outbox-port.ts`), with every
other port — **not** in `@pickupvb/notifications`. Two reasons:

- **Keep `domain` dependency-free.** `domain` currently depends on nothing
  (the Onion core). If the port referenced `NotificationKind` / `NotificationChannel`,
  `domain` would need a dep on `@pickupvb/notifications`. Instead `kind` /
  `channel` are **plain `string`s** in the port — which is honest: they're text
  columns on `notification_outbox`, and the typed registry is applied at the
  `notify()` boundary (which imports `@pickupvb/notifications`).
- **Avoid a new package edge.** No `infrastructure → notifications` dependency,
  no build-graph change.

```ts
interface NotificationOutboxPort {
  loadPreferences(userId: string): Promise<NotificationPreferences | null>;
  getUserEmail(userId: string): Promise<string | null>;
  insertInApp(n: InAppNotification): Promise<void>;
  enqueue(m: OutboxMessage): Promise<void>;
}
```

`NotificationPreferences` is the camelCase read model (the adapter maps the
snake_case row); `OutboxMessage` / `InAppNotification` are the write DTOs.

### 2. Adapter on the admin client, constructed at the boundary

`SupabaseNotificationOutboxRepository` (infrastructure) implements the port. It's
**client-injected** with the service-role client, and `notify()` constructs it
(`new SupabaseNotificationOutboxRepository(createSupabaseAdminClient())`) so the
session-less fan-out stays explicit and visible (pitfall #8: admin client is
correct for session-less crons / fan-out). `getUserEmail` wraps
`admin.auth.admin.getUserById`, so even the Auth lookup leaves `notify.ts`.

### 3. A testable `dispatch(port, …)` seam

`notify()` keeps its signature and best-effort `try/catch` + `log.warn`. The
orchestration (load prefs + email, compute channels, fan out) moves into an
**exported `dispatch(outbox, kind, userId, payload, opts)`** that takes the port,
so the channel-selection + fan-out behavior can be unit-tested with a fake port —
the test this "silent in prod" path was missing.

### 4. Incremental migration plan

| Increment       | Migrates                                                        | Behind                                                            |
| --------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| **This bundle** | `lib/notify.ts` fan-out                                         | `NotificationOutboxPort` + `SupabaseNotificationOutboxRepository` |
| Follow-up       | `api/notifications/worker` (drain), `outbox-purge`              | outbox read/claim/complete + purge methods on the port            |
| Follow-up       | `api/notifications/subscribe` (push_subscriptions)              | a `PushSubscriptionPort` (or methods on the same adapter)         |
| Follow-up       | event/team `broadcast-actions.ts`, `_actions/hide-broadcast.ts` | a `BroadcastPort`                                                 |
| Follow-up       | `profile/notifications` page + actions                          | `notification_preferences` read/write methods                     |

## Consequences

- **Easier:** `notify()` gets a test seam (the fan-out behavior is now pinned by
  a Vitest), and its raw admin `supabase.from(...)` writes move behind the port.
  A notification-failure is now **logged** (the adapter surfaces the row error;
  the old code read no `{ error }` and dropped it silently).
- **Harder / watch out:** plain-string `kind`/`channel` in the port means the
  type link to `@pickupvb/notifications` lives only at the `notify()` boundary —
  acceptable for a persistence port over text columns. Minor behavior change: a
  rare per-row insert error now propagates to the outer `catch` (logged) and
  skips the remaining channels in that one call, rather than being silently
  ignored per-channel — net safer (failures surface).
- **Committed to:** new notification triggers call `notify()`; new outbox/broadcast/
  subscription writes extend the port, not raw `supabase.from(...)`.
- **Not solved this bundle:** the worker / purge / subscribe / broadcasts / prefs
  surfaces (sequenced above).

## Alternatives considered

- **Port in `@pickupvb/notifications` with typed `NotificationKind`/`Channel`.**
  More cohesive + typed, but forces an `infrastructure → notifications` dep and
  (for a typed `domain` port) a `domain → notifications` dep. Rejected to keep
  `domain` dependency-free and avoid a new package edge; the typing is applied at
  the `notify()` boundary instead.
- **Leave `notify.ts` as-is.** It's the single most-reused notification path and
  the one with no test despite being best-effort/silent — exactly the case the
  audit flags. Migrating it is the highest-value slice.
- **Move `notify()` into `@pickupvb/application`.** It's a session-less
  admin-client service called from many web sites; keeping it in `apps/web/lib`
  as the composition point (constructing the infra adapter) is simpler and
  matches the existing shape.
