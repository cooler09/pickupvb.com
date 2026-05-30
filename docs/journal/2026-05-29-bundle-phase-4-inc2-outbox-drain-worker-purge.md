# 2026-05-29 — Bundle: Phase 4 (increment 2) — outbox drain (cron worker + purge)

Continues the notification subdomain (ADR 0022). inc. 1 did the enqueue side
(`notify` fan-out); this does the **drain side** — the cron worker that delivers
queued rows and the daily purge.

## What changed

- **Domain** (`notifications/outbox-port.ts`): a `NotificationOutboxDrainPort`
  (segregated from the enqueue-side `NotificationOutboxPort` per ISP) with
  `claimBatch` / `markSent` / `markSkipped` / `markFailed` / `purgeTerminal` /
  `purgeFailed`, plus `OutboxRecord` + `OutboxFailure` types.
  `notifications/push-subscription-port.ts` (new): `PushSubscriptionPort`
  (`listByUsers` / `deleteByEndpoints`) + `PushSubscriptionRecord`.
- **Infra**: `SupabaseNotificationOutboxRepository` now also implements the drain
  port (claim flips due `pending`→`sending` + selects; the mark/purge methods
  map to the prior inline updates/deletes). New
  `SupabasePushSubscriptionRepository` (service-role).
- **Web**:
  - [worker route](../../apps/web/src/app/api/notifications/worker/route.ts) —
    `claimBatch`, push-sub prefetch (`listByUsers`), status updates
    (`markSent`/`markSkipped`/`markFailed`), and dead-endpoint pruning
    (`deleteByEndpoints`) all go through the ports. The **delivery providers**
    (`sendEmail`, `sendWebPush`) and the **retry/backoff policy** stay in the
    route.
  - [purge route](../../apps/web/src/app/api/notifications/outbox-purge/route.ts)
    — the two `notification_outbox` deletes → `purgeTerminal` / `purgeFailed`.

## Decisions

- **ISP: a separate drain port, not methods on the enqueue port.** Delivery
  callers only `enqueue` / `insertInApp`; the worker only claims/completes.
  Splitting the interfaces keeps each consumer depending on the slice it uses
  (avoiding the P2-2 god-port shape) — while the **same** `SupabaseNotification­OutboxRepository`
  implements both, since it's one table.
- **`PushSubscriptionPort` is its own port.** `push_subscriptions` is a distinct
  table read+pruned by the worker and written by the subscribe route (next
  increment, which adds `upsert`). A dedicated port is the clean home; this
  increment ships the worker's read/delete half.
- **Delivery + retry policy stay in the route.** The ports abstract only the DB
  ops. `sendEmail` / `sendWebPush`, the per-device push fan-out + gone/error
  aggregation, and the `BACKOFF_MIN` / `MAX_ATTEMPTS` arithmetic are orchestration
  / provider concerns — moving them behind a port would be miscategorizing them.
  Behavior preserved exactly (including the counter quirk where a skipped push
  row still increments `sent`).
- **The `community_listing_reports` purge stays raw.** It's in the same daily
  cron but belongs to the community-listings subdomain, not the notification
  port — left as a direct admin delete with a comment so it isn't mistaken for a
  missed migration.
- **No new tests.** The drain is DB plumbing + provider calls; the retry
  arithmetic is unchanged and trivial. The enqueue-side fan-out is the behavior
  pinned by inc. 1's `notify.test.ts`.

## Changes

- Domain: `notifications/outbox-port.ts` (drain port + records);
  `notifications/push-subscription-port.ts` (new) + barrel.
- Infra: `supabase-notification-outbox-repository.ts` (drain methods);
  `supabase-push-subscription-repository.ts` (new) + barrel.
- Web: `api/notifications/worker/route.ts`, `api/notifications/outbox-purge/route.ts`.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(domain 267, application 42, web 55, infra 7; lint 0 errors). No DB change.

## Follow-ups (rest of the notification subdomain, P2-1 Fix #3)

- **Push subscribe** (`api/notifications/subscribe`) — add `upsert` (+ delete?)
  to `PushSubscriptionPort` and migrate the route.
- **Broadcasts** (event/team `broadcast-actions.ts`, `_actions/hide-broadcast.ts`)
  — a `BroadcastPort`.
- **Preferences** (`profile/notifications` page + actions) —
  `notification_preferences` read/write (the page write side).
- Then the deferred `load-event-detail.ts` host-social-handles read — the last
  P2-1 remnant outside notifications.
