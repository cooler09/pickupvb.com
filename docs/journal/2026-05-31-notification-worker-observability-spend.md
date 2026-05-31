# Notification worker — Vercel observability-event spend (2026-05-31)

## Context

Vercel's monthly budget was being consumed by **observability events**. Root
cause was structural, not a traffic spike: the notification outbox worker
(`/api/notifications/worker`) was scheduled `* * * * *` — every minute, 24/7 —
firing into a mostly-empty queue. ~43,200 function invocations/month, each
booking its invocation + logs + auto-traces as billable observability events.

Investigation ruled out the other suspects: no `@vercel/analytics` /
`speed-insights` widgets; only 7 `console.*` and zero `log.info` calls in app
code (`log.debug` is dev-gated), so logging wasn't a driver; PostHog and Sentry
are separate bills. The cron was the dominant source.

## Decisions

- **Chose every-5-min over every-1-min for the worker cron** (interim, shipped
  immediately) — −80% invocations for ≤5-min added latency on a fresh send.
- **Chose a hybrid event-driven model over pure event-driven** (ADR 0026).
  Retries are time-based: `claimBatch` gates on `scheduled_for <= now()` and
  `markFailed` reschedules into the future, so an INSERT trigger can never fire a
  retry. A sweep cron is structurally required — the kick handles fresh sends,
  the cron handles retries + dropped kicks.
- **Chose a migration-defined `pg_net` trigger over Supabase Database Webhooks
  (dashboard)** — keeps the trigger under version control (repo convention:
  migrations are source of truth). Database Webhooks are the same thing
  un-versioned.
- **Chose to ship the trigger inert** (no-op when the Vault URL secret is
  absent) so the migration is safe to deploy before per-env secrets exist, and
  harmless on local/preview. Activation is a separate, reversible sequence.
- **Lowered Sentry prod `tracesSampleRate` 10% → 2%** (server + edge). Honest
  scope: this mainly trims the Sentry bill / per-request span overhead, not the
  Vercel observability line directly — a cheap hedge, left the client rate alone.
- **Did NOT drop the cron to `*/15` yet.** That waits until the kick is verified
  on dev — dropping it before the Vault secret is seeded would lag prod
  notifications up to 15 min.

## Changes

- `apps/web/vercel.json` — worker cron `* * * * *` → `*/5 * * * *`.
- `apps/web/sentry.server.config.ts`, `sentry.edge.config.ts` — prod
  `tracesSampleRate` `0.1` → `0.02` (+ comments).
- `supabase/migrations/20260822000000_event_driven_notification_delivery.sql` —
  new: `pg_net` extension, `kick_notification_worker()` SECURITY DEFINER trigger
  fn (Vault-read URL/secret, fire-and-forget `net.http_get`, inert when
  unseeded), statement-level `AFTER INSERT` trigger on `notification_outbox`.
- `docs/adr/0026-event-driven-notification-delivery.md` — new (Proposed).
- `docs/adr/README.md` — index: added 0024, 0025 (were missing), 0026.
- `packages/domain/src/notifications/outbox-port.ts`,
  `packages/infrastructure/src/supabase-notification-outbox-repository.ts`,
  `apps/web/src/lib/notify.ts` — `enqueue` now takes an `OutboxMessage[]` and
  inserts the whole fan-out in one statement; `dispatch()` collects channels and
  flushes once → one kick per `notify()` instead of one per channel.
- `apps/web/src/lib/notify.test.ts` — +2 tests pinning the batching contract
  (single enqueue call per fan-out; zero when no outbox channel resolves).
- `supabase/migrations/20260822000100_debounce_notification_worker_kick.sql` —
  new: `notification_worker_kick` single-row debounce table + `create or replace`
  of the trigger fn to gate the kick on `last_kicked_at < now() - 10s` (row-locked
  conditional UPDATE). Collapses a cross-user broadcast (N inserts → N statements)
  to ~one kick per window.
- `apps/web/src/app/api/notifications/worker/route.ts` — worker now **drains to
  empty**: `drainOneBatch()` helper looped until the queue clears, bounded by
  `DRAIN_BUDGET_MS` (50s, under `maxDuration`). Makes the debounced single kick
  safe — one wake delivers a whole burst, not just one `BATCH`.

## Patterns observed

- **Vercel observability events are metered by volume, not dashboard usage.**
  "We use PostHog/Sentry instead" doesn't lower the Vercel bill — only reducing
  event sources (invocations, logs, traces) does. PostHog (product) and Sentry
  (app errors) don't cover platform-level failures (timeouts, OOM, cold starts,
  cron status) that only Vercel's runtime logs see.
- **A fixed-interval cron over an outbox is a standing observability-event
  tax.** The outbox decouples enqueue from drain by design, but a time-poll
  re-couples them at the cost of constant idle invocations. An INSERT kick
  restores the decoupling without the poll — for the fresh-send case.

## Follow-ups

- **Seed Vault per environment + verify the kick on dev**, then flip ADR 0026 to
  Accepted and drop the sweep cron `*/5` → `*/15`. (Sequence in the ADR.)
- **Coalescing: done.** Per-dispatch batching (one `enqueue([...])` per
  `notify()`) + the `last_kicked_at` debounce + worker drain-to-empty collapse
  both same-user and cross-user (broadcast) bursts to ~one kick per window.
  Residual: the post-final-kick tail of a burst relies on the sweep cron — a
  more-correct level-triggered "kick-pending flag cleared by the worker" is a
  possible refinement if the tail latency ever bites (noted in ADR §3).
- **Run the broadcast path e2e on dev:** the debounce + drain-to-empty is only
  exercised end-to-end by a real >`BATCH`-recipient broadcast. Add/run a
  Playwright case (host broadcast → all attendees delivered) against dev once
  Vault is seeded — unit tests can't cover the DB trigger + pg_net round-trip.
- **Validate the migration applies** — `pnpm db:migrate` could not run this
  session (Docker daemon down). Apply locally before relying on it.
- **Confirm in the Vercel dashboard** (Observability → segment by route) that
  `/api/notifications/worker` was the dominant event source, and check whether
  the account is paying for **Observability Plus** (droppable given Sentry +
  PostHog) and set a spend cap / budget alert.
