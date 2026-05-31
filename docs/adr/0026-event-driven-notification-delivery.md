# 0026. Event-driven notification delivery — DB kick + low-frequency sweep

- **Status:** Proposed
- **Date:** 2026-05-31
- **Relates to:** [ADR 0022 — `NotificationOutboxPort`](0022-notification-outbox-port.md)
- **Addresses:** Vercel observability-event spend — the `notification_outbox`
  worker cron ran every minute (`* * * * *` ≈ 43,200 invocations/month), firing
  into a mostly-empty queue 24/7. Each idle tick still booked a function
  invocation, its logs, and auto-traces as billable observability events.

## Context

Notification delivery is an **outbox** pattern. `notify()` →
[`dispatch()`](../../apps/web/src/lib/notify.ts) inserts a row into
`notification_outbox` (email/sms/push); the in-app channel goes to
`notifications` and is delivered by Supabase Realtime, not the worker. A Vercel
cron hit [`/api/notifications/worker`](../../apps/web/src/app/api/notifications/worker/route.ts)
every minute to drain due rows.

The drain is **time-decoupled from the enqueue by design** — that's the whole
point of an outbox — but the only thing waking the worker was a fixed-interval
poll. At our volumes the queue is empty on the vast majority of ticks, so the
poll is almost pure waste: ~43k invocations/month, each generating Vercel
observability events, to deliver a comparatively tiny number of notifications.
An interim fix already dropped the cron to `*/5` (−80%), at the cost of up to
5 minutes of delivery latency on a fresh notification.

The crux constraint that shapes the design: **retries are time-based, not
insert-based.** [`claimBatch`](../../packages/infrastructure/src/supabase-notification-outbox-repository.ts#L102-L121)
gates on `status='pending' AND scheduled_for <= now()`, and
[`markFailed`](../../packages/infrastructure/src/supabase-notification-outbox-repository.ts#L143-L154)
reschedules a failed row by setting `scheduled_for` to a _future_ time
(backoff: 1m, 5m, 25m, 2h, 6h). An `INSERT` trigger never fires for a retry —
the row already exists. So a pure event-driven model cannot replace the poll;
something must still sweep rows whose `scheduled_for` has come due.

## Decision

**Adopt a hybrid model: an event "kick" for fresh sends + a low-frequency
"sweep" cron for retries and dropped kicks.** Both wake the same unchanged
worker; `claimBatch` drains all due rows regardless of who woke it, so neither
the route handler nor the repository changes.

```
notify() ─INSERT─► notification_outbox ─┬─ AFTER INSERT trigger ─► net.http_get ─► /worker   (kick: instant, fresh sends)
                                         └─ low-freq cron ─────────► GET /worker             (sweep: retries + missed kicks)
```

### 1. The kick — statement-level `AFTER INSERT` trigger calling `pg_net`

A `SECURITY DEFINER` trigger function `kick_notification_worker()` issues a
fire-and-forget `net.http_get` to the worker URL with the `CRON_SECRET` bearer
header the route already checks. It is **statement-level** (`FOR EACH
STATEMENT`), so a bulk `insert([...])` fires **one** kick, not one per row.

Worker URL + secret come from **Supabase Vault** (`vault.decrypted_secrets`),
read by name at trigger time. **If the URL secret is absent the function
no-ops** — that is the deliberate local-dev / unseeded-preview fallback, and it
makes the migration safe to deploy before any secret exists (the trigger is
inert until seeded). The function **never raises**: a kick failure must not roll
back the enqueue, and the sweep is the backstop.

`pg_net` is async fire-and-forget (it queues into `net.http_request_queue`; the
response lands in `net._http_response`). A failed kick is therefore silent —
which is _why_ the sweep is non-negotiable, not redundant.

### 2. The sweep — keep a cron, at low frequency

The existing Vercel cron stays as the backstop for (a) due retries and (b) the
rare dropped kick. Once the kick is verified on dev, it drops from `*/5` to
`*/15` (≈2,880 invocations/month — ~93% below the original baseline). Moving the
sweep into Supabase `pg_cron` (calling the same endpoint via `net.http_get`) to
remove it from Vercel entirely is a possible later step; it trades Vercel's cron
visibility for a lower invocation count and is not part of this decision.

### 3. Rollout sequence (why this ADR is Proposed, not Accepted)

The migration in this bundle ships the **inert** trigger only. Activation is a
deliberate, reversible sequence:

1. Migration applied (trigger exists, no-ops — no Vault secret yet). **← this bundle**
2. Seed Vault per environment (out-of-band; secrets are data, not schema, and
   differ per project — they must not live in a committed migration):
   ```sql
   select vault.create_secret('https://dev.pickupvb.com/api/notifications/worker', 'notif_worker_url');
   select vault.create_secret('<CRON_SECRET for that env>', 'notif_worker_cron_secret');
   ```
   (prod URL + secret on the prod project; nothing on local → kick stays inert.)
3. Verify on dev: enqueue a notification, confirm a row lands in
   `net._http_response` and delivery latency drops to seconds.
4. Drop the sweep cron `*/5` → `*/15` in `vercel.json`.

The ADR flips to **Accepted** after step 3 verifies on dev.

## Consequences

- **Easier / better:** fresh notifications deliver in ~seconds instead of up to
  5 minutes, _and_ idle invocations fall ~93% below the original every-minute
  baseline once the cron drops. The worker, route auth, and `claimBatch` are
  untouched — the change is purely "what wakes the worker."
- **New infrastructure:** `pg_net` (first HTTP-from-Postgres use in the repo;
  prior `pg_cron` jobs are pure SQL) and Vault-seeded per-environment secrets.
  The Vault seeding is a manual, documented, per-project step — the one
  operational wrinkle.
- **Per-dispatch batching is in place:** `dispatch()` collects a recipient's
  channels and flushes them in one `enqueue([...])` (one statement → one kick),
  so a single `notify()` fires one kick regardless of how many channels resolve.
  The `enqueue` port method takes an array; in-app rows stay separate (different
  table, Realtime-delivered). Atomicity is a non-issue — the per-channel keys are
  namespaced (`email:`/`sms:`/`push:`) against a `unique` `idempotency_key`, so a
  batch only ever collides all-or-nothing on a retry, and the old loop already
  aborted remaining channels on any insert error.
- **Watch out — cross-user broadcast fan-out still multi-kicks:** a broadcast
  loops `notify()` once per recipient, so an N-recipient broadcast fires ~N kicks
  (per-dispatch batching only collapses one user's channels). Empty-queue kicks
  are cheap (fast 200s), so this is bounded, not broken; a short coalescing
  throttle (advisory lock + `last_kicked_at`) is the deferred follow-up if it
  ever matters.
- **Committed to:** the worker may be woken by either path; new outbox-adjacent
  changes must keep `claimBatch`'s "drain all due rows" semantics so a single
  wake delivers everything pending.
- **Concurrency:** kick + sweep can overlap. `claimBatch` flips `pending →
sending` atomically (not `SKIP LOCKED`; the existing code already accepts this
  race), and idempotency keys guard duplicate enqueues — at-least-once delivery
  is preserved at our volumes.

## Alternatives considered

- **Pure event-driven (drop the cron entirely).** Rejected: retries are
  time-based (`scheduled_for` in the future), so an INSERT trigger can never
  fire them. A sweep is structurally required.
- **Just lower the poll frequency (already shipped as `*/5`).** Simple, no new
  infra, but retains an idle baseline and adds up-to-5-min latency on every
  fresh send. The kick removes the latency _and_ lets the sweep go lower.
- **Move delivery into a Supabase Edge Function** triggered by a Database
  Webhook (off Vercel entirely). Removes Vercel notification invocations
  completely, but is a much larger rewrite — porting Resend + Web Push (VAPID)
  to Deno — for a problem the kick + cron-drop already solves. Deferred.
- **Supabase managed Database Webhooks (dashboard UI)** instead of a migration.
  Same trigger + `pg_net` under the hood, but it's per-environment dashboard
  config that escapes version control. Rejected to keep migrations the source of
  truth (repo convention).
