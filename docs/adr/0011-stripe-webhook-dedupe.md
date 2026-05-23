# 0011. Stripe webhook idempotency via dedupe table

- **Status:** Accepted
- **Date:** 2026-05-22

## Context

Stripe retries webhook delivery for up to three days on any non-2xx
response, and occasionally re-delivers events successfully ack'd by the
endpoint (network blips, redeploys mid-flight). The receiver at
[apps/web/src/app/api/webhooks/stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts)
dispatches to per-type handlers that mutate Supabase
(`event_attendees`, `event_payment_audit`, `host_stripe_accounts`,
`event_tickets`, …). Naïvely re-running a handler on a redelivery
double-credits attendees, double-fires `payment.refunded` notifications,
and corrupts the `event_payment_audit` log.

Per-handler idempotency at the row level (`upsert by stripe_session_id`,
"if already-refunded, skip") would be possible but means every new
handler must remember to add the guard correctly — easy to get wrong,
hard to audit, and not testable from outside the handler. A
receiver-level dedupe gate makes the contract obvious: "if we've seen
this `evt_…` id before, return 200 immediately and dispatch nothing".

## Decision

Add a `public.stripe_webhook_events` table whose primary key is the
Stripe event id, populated by
[supabase/migrations/20260515000000_stripe_foundation.sql](../../supabase/migrations/20260515000000_stripe_foundation.sql):

```sql
create table public.stripe_webhook_events (
  id           text primary key,   -- evt_…
  event_type   text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz         -- nullable; filled once dispatch succeeds
);
```

The receiver performs an **`upsert` with `ignoreDuplicates: true`**
keyed on `id`, then checks the returned rows:

- **Non-empty array** — first sighting. Dispatch the handler. On
  success, write `processed_at = now()`. On handler throw, **delete the
  log row** so the next Stripe retry isn't deduped, and return 500.
- **Empty array** — row already existed. Return `200 { ok: true,
deduped: true }` without dispatching.

Signature verification happens **before** the dedupe insert so
unsigned/spoofed payloads don't pollute the log.

Service-role only (no RLS policies); only the webhook handler and a
small number of server actions read this table.

We deliberately **do not store the full Stripe payload**:

- Payloads are large (KBs per event × tens of thousands of events over
  time).
- They may contain PII (customer email, line-item descriptions, last 4
  of card via `payment_intent` on certain events).
- Re-derivation is fine — Stripe keeps every event queryable from the
  Dashboard for 30 days, and we trust the signature-verified payload at
  handle time.

Connect and platform events share one endpoint, one signing secret, and
one dedupe table. See [docs/stripe-webhooks.md](../stripe-webhooks.md).

## Consequences

- ✅ Every handler can assume "this event has not been processed before";
  per-handler idempotency code disappears. Adding a new handler is a
  single `case` in the dispatch switch.
- ✅ The log row is queryable for incident response — "did we receive
  evt_abc?" is one SELECT. The `(event_type, received_at desc)` index
  supports backfill-style scans.
- ✅ Switching from the previous insert-and-catch-`23505` pattern to
  `upsert ignoreDuplicates` shaves ~5–20 ms per retry by avoiding the
  exception path. (Performance audit P2 #9.)
- ❌ A failed handler that then fails again on retry leaves
  `received_at` set but `processed_at` null — needs operator inspection
  to distinguish "in-flight" from "stuck". Mitigated by the "delete on
  handler throw" branch so retries always re-dispatch; the only way to
  end up null-`processed_at` is a process crash between insert and the
  end of `dispatch`.
- ❌ The dedupe is per-receiver, not per-handler. If we ever split
  platform vs. Connect into two endpoints, we'd want a second
  table-or-namespace to avoid one endpoint deduping an event the other
  hasn't seen. Today they share an endpoint, so this is moot — flagged
  in `docs/stripe-webhooks.md`.

## Alternatives considered

- **Per-handler idempotency only.** Forced every new handler to author
  its own guard. Rejected — invariant kept slipping during the original
  Stripe rollout.
- **Stripe's `Stripe-Signature` timestamp + replay window.** Defends
  against signature-replay attacks but does nothing for legitimate
  redeliveries of the same event id within Stripe's three-day retry
  window. Different problem.
- **Redis / Upstash for the dedupe key.** Would work but adds an
  external dependency for a workload that runs at low single-digit
  events/sec. Postgres `primary key` + `upsert ignoreDuplicates` is
  one line of SQL and runs in the same transaction as the rest of the
  handler infrastructure.
- **Store the full payload for forensic value.** Rejected on size +
  PII grounds. The Stripe Dashboard is the source of truth for
  payloads; the dedupe table is the source of truth for "did we
  process this?".
