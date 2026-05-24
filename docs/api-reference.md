# API reference

> **Audience:** developers integrating against the PickupVB HTTP surface,
> incident responders trying to understand a 5xx in the logs, and future
> maintainers adding new endpoints. For domain-layer queries/commands
> behind these routes, see
> [packages/application/README.md](../packages/application/README.md).
> For the runtime architecture, see [AGENTS.md](../AGENTS.md).

All endpoints live under `apps/web/src/app/api/**/route.ts` and are
served by the Next.js App Router on the same Vercel deployment as the
web UI.

## Conventions

**Error envelope.** Every JSON endpoint returns
[`{ error: <code>, message?: string, details?: unknown }`](../apps/web/src/lib/api-helpers.ts)
on failure. CSV endpoints return plain-text error strings. The mapping
from `DomainError` subclass → HTTP status is centralized in
[`handleError`](../apps/web/src/lib/api-helpers.ts):

| Error class                    | Code                  | Status |
| ------------------------------ | --------------------- | ------ |
| `NotFoundError`                | `NOT_FOUND`           | 404    |
| `UnauthorizedError`            | `UNAUTHORIZED`        | 401    |
| `ValidationError` / `ZodError` | `VALIDATION`          | 400    |
| `CapacityExceededError`        | `CAPACITY_EXCEEDED`   | 409    |
| `ConflictError`                | `CONFLICT`            | 409    |
| `RateLimitError`               | `RATE_LIMIT`          | 429    |
| `InvariantViolation`           | `INVARIANT_VIOLATION` | 422    |
| (any other thrown value)       | `INTERNAL`            | 500    |

Don't add ad-hoc status mapping in route handlers — throw the typed
error and let `handleError` map it.

**Auth.** Most endpoints honor the Supabase session cookie via
[`getServerSupabase()`](../apps/web/src/lib/supabase.ts). The
`requireUser()` helper from
[api-helpers.ts](../apps/web/src/lib/api-helpers.ts) short-circuits to
`401 { error: 'UNAUTHORIZED' }` when there's no session. Anonymous
auth is enabled — guard "real account required" actions by checking
`is_anonymous` on the JWT, not just `user != null`.

**`dynamic = 'force-dynamic'`.** Every route handler in this app opts
out of caching because they all read per-user state. New routes should
do the same unless they have a documented reason to cache.

**CSRF.** Same-origin browser requests are the primary path. There is
no CSRF token — Supabase Auth uses `SameSite=Lax` session cookies, and
mutating endpoints accept JSON only (no `application/x-www-form-urlencoded`
from cross-origin forms).

---

## Routes

### Health

#### `GET /api/health` — liveness probe

[Source](../apps/web/src/app/api/health/route.ts) ·
**Auth:** none ·
**Always 200.**

Returns `{ status: 'ok', service: 'pickupvb-web', time }`. Use for
uptime monitors that just want "the process is up".

#### `GET /api/health/deep` — DB-backed health probe

[Source](../apps/web/src/app/api/health/deep/route.ts) ·
**Auth:** none ·
**200 / 503.**

Runs `select id from profiles limit 1` under RLS. Returns
`{ status, db, durationMs, time, message? }`. 503 on any DB error so
uptime monitors can flip alerts. Cheaper than parsing JSON from a
mutating endpoint.

---

### Events

#### `GET /api/events` — search

[Source](../apps/web/src/app/api/events/route.ts) ·
**Auth:** optional (viewer-scoped results) ·
**Schema:** [`SearchEventsSchema`](../packages/types/src/index.ts).

Query params are parsed by Zod; unknown keys are stripped. Returns the
`SearchEventsQuery` result (paginated event list). When signed in, the
`viewerId` informs join-state and visibility checks.

#### `POST /api/events` — create

[Source](../apps/web/src/app/api/events/route.ts) ·
**Auth:** required ·
**Body:** [`CreateEventSchema`](../packages/types/src/index.ts) ·
**Response:** `201 { eventId }` ·
**Errors:** 400 (validation), 401, 422 (invariant).

#### `GET /api/events/[id]` — detail

[Source](../apps/web/src/app/api/events/[id]/route.ts) ·
**Auth:** optional ·
**Errors:** 404.

Returns the public read model for a single event. The richer
viewer-scoped detail (with `canManage`, payment state, etc.) is served
in-app via the `getEventDetail` handler, not over HTTP.

#### `POST /api/events/[id]/join` — join an event

[Source](../apps/web/src/app/api/events/[id]/join/route.ts) ·
**Auth:** required ·
**Response:** `204 No Content` ·
**Errors:** 401, 404, 409 (`CAPACITY_EXCEEDED`, `CONFLICT`), 422.

The browser UI prefers the server action for this, but the HTTP route
is the canonical API for third-party clients.

#### `POST /api/events/[id]/leave` — leave an event

[Source](../apps/web/src/app/api/events/[id]/leave/route.ts) ·
**Auth:** required ·
**Response:** `204` ·
**Errors:** 401, 404.

#### `GET /api/events/[id]/attendees.csv` — Pro attendee export

[Source](../apps/web/src/app/api/events/[id]/attendees.csv/route.ts) ·
**Auth:** required + must `canManage` + must be Pro ·
**Errors:** 401, 402 (`PRO_REQUIRED`), 403, 404.

CSV with `user_id`, `display_name`, `position`, `payment_status`,
`amount_paid_cents`, `payment_intent_id`. Uses the admin Supabase
client (RLS bypass) after authorization checks in the handler.

---

### Statements (CSV)

Both annual-statement routes are scoped to the calling user via RLS;
the `[year]` segment is validated as an integer in `2000..=2100`.
Path note: the literal `.csv` is a separate segment from `[year]`
because mixing them confuses `typedRoutes`.

#### `GET /api/receipts/[year]/statement.csv`

[Source](../apps/web/src/app/api/receipts/[year]/statement.csv/route.ts) ·
**Auth:** required ·
**Errors:** 400 (bad year), 401.

Annual statement of every paid signup **the viewer made**, grouped by
`payment_intent_id` so a paid+refund pair appears as one net row.
Backed by `event_payment_audit` under the
`event_payment_audit_select_user` RLS policy. Columns: `date_paid,
event_title, event_date, event_city, event_region, host, paid_usd,
refunded_usd, net_usd, payment_intent_id`.

#### `GET /api/earnings/[year]/statement.csv`

[Source](../apps/web/src/app/api/earnings/[year]/statement.csv/route.ts) ·
**Auth:** required (host) ·
**Errors:** 400, 401.

Annual statement of every paid signup **on events the viewer hosts**.
Same source table under the `event_payment_audit_select_host` policy.
Adds a deterministic platform-fee estimate using the host's current
Pro tier (`PRO_PLATFORM_FEE_BPS` vs. `PLATFORM_FEE_BPS`). Columns:
`date_paid, event_title, event_date, gross_usd, refunded_usd, net_usd,
est_platform_fee_usd, est_payout_usd, payment_intent_id`. Stripe's
processing fee is **not** included — see Stripe Express for
authoritative payout amounts.

---

### Notifications

#### `POST /api/notifications/subscribe` — register a Web Push subscription

[Source](../apps/web/src/app/api/notifications/subscribe/route.ts) ·
**Auth:** required ·
**Body:** `{ endpoint, keys: { p256dh, auth } }` (the JSON from
`PushSubscription.toJSON()`) ·
**Errors:** 400 (`bad-json` / `missing-fields`), 401.

Upserts on `endpoint`. If the same endpoint is already owned by a
different user (account-switch on the same browser), ownership is
overwritten. The browser-side companion lives in
[apps/web/src/lib/push-client.ts](../apps/web/src/lib/push-client.ts).

#### `GET|POST /api/notifications/worker` — outbox cron

[Source](../apps/web/src/app/api/notifications/worker/route.ts) ·
**Auth:** `Authorization: Bearer $CRON_SECRET` (Vercel cron attaches
automatically) ·
**Schedule:** `* * * * *` (every minute) — see
[apps/web/vercel.json](../apps/web/vercel.json).

Pulls up to 50 pending rows from the outbox, dispatches via the
email/push channel adapters, and updates status. Retry backoff: 1m,
5m, 25m, 2h, 6h (capped at 5 attempts). SMS rows stay `pending` until
the SMS adapter lands.

#### `GET|POST /api/notifications/reminders` — event reminder cron

[Source](../apps/web/src/app/api/notifications/reminders/route.ts) ·
**Auth:** `Authorization: Bearer $CRON_SECRET` ·
**Schedule:** `*/15 * * * *` (every 15 minutes).

Fires `event.reminder.24h` (events starting in 22–26h) and
`event.reminder.2h` (events starting in 90–150min). Dedupe is per
attendee row via `reminder_24h_sent_at` / `reminder_2h_sent_at`,
marked **before** dispatching — accept at-most-once over at-least-once
for reminders (better to miss one than spam).

---

### Webhooks

#### `POST /api/webhooks/stripe`

[Source](../apps/web/src/app/api/webhooks/stripe/route.ts) ·
**Auth:** Stripe signature header (`STRIPE_WEBHOOK_SECRET`) ·
**Runtime:** `nodejs` (needed for `crypto`).

Single endpoint for both platform and Connect events. Pipeline:

1. Verify signature against raw request body.
2. `upsert ignoreDuplicates` on `stripe_webhook_events` keyed by the
   Stripe `evt_…` id. Empty result ⇒ already processed ⇒ return
   `200 { ok: true, deduped: true }` immediately.
3. Dispatch to a per-type handler (`account.updated`,
   `checkout.session.completed`, `charge.refunded`,
   `customer.subscription.*`).
4. On success, set `processed_at = now()`. On handler throw, delete
   the dedupe row so Stripe's retry will re-dispatch, and return 500.

Returns 4xx (not 5xx) for expected failures — bad signature, unknown
event type — so Stripe doesn't retry forever. See
[ADR 0011](adr/0011-stripe-webhook-dedupe.md) for the rationale and
[docs/stripe-webhooks.md](stripe-webhooks.md) for the operational
overview.

---

### Geocoding

#### `GET /api/geocode/autocomplete?q=…`

[Source](../apps/web/src/app/api/geocode/autocomplete/route.ts) ·
**Auth:** none (proxy) ·
**Response:** `AutocompleteSuggestion[]`.

Server-side proxy to Photon (primary) with Nominatim fallback for
periodic Photon 502s. Filtered to US + populated US territories
(`us, pr, vi, gu, mp, as`). Kept server-side so the polite
`User-Agent` is consistent and provider swaps are local.

---

### Diagnostics

#### `GET /api/sentry-test?kind=exception|message|unhandled`

[Source](../apps/web/src/app/api/sentry-test/route.ts) ·
**Auth:** none (production-safe — pure error capture).

Intentionally throws so Sentry captures a server-side error.
`kind=message` captures a message instead; `kind=unhandled` throws via
a rejected promise outside the request handler. Hit after any
Sentry-config change to verify the integration end-to-end.

---

## Adding a new endpoint

1. Create `apps/web/src/app/api/<segment>/route.ts`. Export `GET`,
   `POST`, etc.
2. Add `export const dynamic = 'force-dynamic'` unless there's a
   documented reason to cache. If you need `crypto`, also add
   `export const runtime = 'nodejs'`.
3. Use [`requireUser()`](../apps/web/src/lib/api-helpers.ts) for
   auth, [`getViewer()`](../apps/web/src/lib/api-helpers.ts) for
   optional auth.
4. Parse input with a Zod schema from
   [`@pickupvb/types`](../packages/types/src/index.ts). Don't
   reach into `request.body` raw.
5. Delegate to a CQRS handler in
   [`handlers`](../apps/web/src/lib/handlers.ts). Throw typed
   `DomainError` subclasses; never `throw new Error(...)` for a domain
   failure.
6. Wrap the body in `try { ... } catch (err) { return handleError(err); }`.
7. Add a row to this doc.

## See also

- [AGENTS.md](../AGENTS.md) — domain-error contract, page-composition
  rules.
- [apps/web/README.md](../apps/web/README.md) — route tree + library
  landmarks.
- [docs/stripe-webhooks.md](stripe-webhooks.md) — Stripe webhook
  operational notes.
- [docs/payments.md](payments.md) — payout routing (host user vs.
  host group) for ticket / team / tip flows.
- [docs/integrations.md](integrations.md) — third-party services we
  call out to.
- [docs/runbook.md](runbook.md) — what to do when an endpoint starts
  5xx-ing.
