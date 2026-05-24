# Monitoring & alerting

> **Audience:** anyone on the receiving end of an alert, or anyone
> trying to answer "is the site healthy right now?". For incident
> response procedure, see [runbook.md](runbook.md); for which
> third-party services we depend on, see [integrations.md](integrations.md).

## TL;DR — where to look

| Question                                | Dashboard                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Is the site up?                         | `GET https://pickupvb.com/api/health` (returns 200) + Vercel deployment status   |
| Can the site talk to the DB?            | `GET https://pickupvb.com/api/health/deep` (200 / 503) + Supabase project status |
| Are users hitting 5xx?                  | [Sentry](#sentry) → Issues → filter `level:error environment:production`         |
| Web vitals / real-user perf?            | Vercel project → **Analytics** + **Speed Insights** tabs                         |
| Is a cron job running?                  | Vercel project → **Cron Jobs** tab (shows last invocation + status per schedule) |
| Are Stripe webhooks succeeding?         | Stripe dashboard → **Developers → Webhooks** (delivery history per endpoint)     |
| Did email/push notifications go out?    | `notifications_outbox` table — see [notification outbox](#notification-outbox)   |
| Is the DB slow?                         | Supabase dashboard → **Database → Query Performance**                            |
| Has E2E smoke passed since last deploy? | [smoke-prod.yml](../.github/workflows/smoke-prod.yml) runs on push to main       |

The Playwright smoke runs after each production deploy and pings the
runbook on failure, but **doesn't block the deploy** — Vercel ships
first. Treat a red smoke run as "something is broken right now"
rather than "the deploy was rejected".

---

## Sentry

Error reporting and performance traces for server, edge, and browser
runtimes.

**Config files** (all opt out gracefully when `NEXT_PUBLIC_SENTRY_DSN`
is unset):

- [apps/web/instrumentation.ts](../apps/web/instrumentation.ts) —
  delegates to the right SDK on Node / Edge cold start.
- [apps/web/sentry.server.config.ts](../apps/web/sentry.server.config.ts)
  — Node runtime (route handlers, server actions, server components).
- [apps/web/sentry.edge.config.ts](../apps/web/sentry.edge.config.ts) —
  Edge runtime (middleware, edge handlers).
- [apps/web/instrumentation-client.ts](../apps/web/instrumentation-client.ts)
  — browser; also wires Session Replay (`0%` normal,
  `100%` on error).

**Required env vars** (see [.env.example](../.env.example)):

| Var                      | Purpose                                |
| ------------------------ | -------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN` | Enables capture. Unset = Sentry off    |
| `SENTRY_ORG`             | Source-map upload (build step)         |
| `SENTRY_PROJECT`         | Source-map upload (build step)         |
| `SENTRY_AUTH_TOKEN`      | Source-map upload (build step; secret) |

**Sampling.** `tracesSampleRate` is 10% in production, 100% in preview
and dev. Bump in `sentry.*.config.ts` if a quota issue ever forces a
cut, but prefer the source over an inline `tracesSampler`.

**Noise filtering.** Already wired:

- **Expected `DomainError` subclasses are dropped** server-side
  (`ignoreErrors` in `sentry.server.config.ts`). They're mapped to
  HTTP 4xx by [api-helpers.ts](../apps/web/src/lib/api-helpers.ts);
  alerting on them would be alerting on user input.
- **E2E traffic is dropped**. Playwright sends
  `x-pickupvb-e2e: 1` (see
  [apps/web/playwright.config.ts](../apps/web/playwright.config.ts));
  the server `beforeSend` returns `null` for those, and the client
  one drops anything where `navigator.webdriver === true`.

**Log helper** ([apps/web/src/lib/log.ts](../apps/web/src/lib/log.ts)).
Use this instead of calling `console.error` + `Sentry.captureException`
separately:

- `log.debug` — dev-only console.
- `log.info` — console + Sentry breadcrumb (no event quota consumed).
- `log.warn` — console + Sentry message (`level: 'warning'`).
- `log.error` — console + Sentry exception. **Returns a promise** —
  always `await` it in serverless route handlers / server actions so
  the event reaches Sentry before the function freezes.

**Verifying the integration.** Hit `/api/sentry-test` after any
config change (also covered in
[api-reference.md](api-reference.md#diagnostics)):

| URL                               | What it does                               |
| --------------------------------- | ------------------------------------------ |
| `/api/sentry-test`                | Throws synchronously → captures exception  |
| `/api/sentry-test?kind=message`   | Captures `info`-level message              |
| `/api/sentry-test?kind=unhandled` | Rejected promise outside the request scope |

**Alerts.** Configure in Sentry → **Alerts**:

- Recommended baseline: notify on **new issues** in `production`
  (excluding the filtered domain errors), and on issue **frequency
  spikes** (>10× baseline over 1h). Route to the same channel as the
  smoke-prod failures.
- Avoid per-event alerts; quota will burn through them and they'll be
  ignored.

---

## Product analytics (PostHog)

Custom events (`event_joined`, `checkout_completed`, `signup_completed`,
etc.) and web vitals flow through the server-side `AnalyticsPort`
([apps/web/src/lib/analytics.ts](../apps/web/src/lib/analytics.ts))
into PostHog via the `posthog-node` adapter. Web vitals are bridged
from [apps/web/src/components/web-vitals-client.tsx](../apps/web/src/components/web-vitals-client.tsx)
through the `/api/web-vitals` beacon. The client component opts out
for WebDriver-controlled browsers via the same `navigator.webdriver`
check as Sentry.

**Page-view coverage is currently not wired.** Vercel Analytics was
retired pre-launch (audit P3 #12, Bundle 82); a `$pageview` capture
through the existing beacon pattern is the obvious follow-up once
real traffic lands.

**Dashboards:** PostHog project. Funnels for join → checkout,
retention by metro, web-vitals trends per route.

**No alerting wired** — product analytics is for trend-watching, not
incident response. If a perf regression matters, capture the metric
in Sentry as a transaction and alert from there.

---

## Vercel Crons

[apps/web/vercel.json](../apps/web/vercel.json) defines two cron
schedules. Both require the `Authorization: Bearer $CRON_SECRET`
header (Vercel attaches automatically). Cron Jobs tab in the Vercel
dashboard shows last invocation, duration, and status per schedule.

| Path                           | Schedule       | Purpose                                      |
| ------------------------------ | -------------- | -------------------------------------------- |
| `/api/notifications/worker`    | `* * * * *`    | Drain `notifications_outbox` (50 rows/batch) |
| `/api/notifications/reminders` | `*/15 * * * *` | Fire 24h + 2h event reminders                |

If `CRON_SECRET` is missing in the environment, the routes fall back
to "allow" so local dev still works — see
[`isAuthorized`](../apps/web/src/app/api/notifications/worker/route.ts)
and [`authorized`](../apps/web/src/app/api/notifications/reminders/route.ts).
**Set `CRON_SECRET` in production** — leaving it unset there means
anyone with the URL can drain the outbox.

**What to watch for.** Cron failures don't trigger Sentry alerts by
default (the routes catch their own errors and report rows-failed in
the JSON response). Add a Vercel monitor or a Sentry cron monitor if
the outbox starts backing up.

---

## Notification outbox

Tables:

- `notifications_outbox` — every queued email/push/SMS. Status field:
  `pending` / `sent` / `failed`. Failed rows keep an `attempts` count
  and a `next_attempt_at` for backoff (1m, 5m, 25m, 2h, 6h; capped at
  5 attempts).
- `push_subscriptions` — Web Push endpoints owned per user. A `410
Gone` from the push provider auto-deletes the row from the worker.

**Quick health checks** (Supabase SQL editor):

```sql
-- Anything backed up beyond the normal "queued, will fire in <1m"?
select status, count(*)
from notifications_outbox
where created_at > now() - interval '24 hours'
group by status;

-- Permanently-failed rows (need triage)
select id, channel, kind, to_address, attempts, last_error
from notifications_outbox
where status = 'failed' and attempts >= 5
order by created_at desc
limit 50;
```

The worker logs each batch via `log.info` / `log.error`, so Sentry
breadcrumbs cover the per-row failures even when the rows themselves
end up in `failed`.

---

## Stripe webhooks

Stripe **Dashboard → Developers → Webhooks** is the authoritative
source for "did Stripe send the event?". Each endpoint shows
delivery attempts, response codes, and lets you replay any event.

Receiver-side, every event is logged in `stripe_webhook_events`
(see [ADR 0011](adr/0011-stripe-webhook-dedupe.md)):

```sql
-- Recent events grouped by type
select event_type, count(*), max(received_at) as last_seen
from stripe_webhook_events
where received_at > now() - interval '24 hours'
group by event_type
order by last_seen desc;

-- Stuck (received but never processed) — needs operator inspection
select id, event_type, received_at
from stripe_webhook_events
where processed_at is null
  and received_at < now() - interval '5 minutes'
order by received_at desc;
```

A row with `processed_at = null` and `received_at` older than a few
minutes usually means the handler crashed between `insert` and
dispatch completion — the delete-on-throw branch should have removed
it, so investigate.

---

## Supabase

**Project dashboard:** **Database → Query Performance** (slow queries),
**Database → Logs** (Postgres logs), **Reports** (storage growth, API
requests, DB size).

**Auth events** live under **Authentication → Logs**.

**Edge / API status** — Supabase status page at
<https://status.supabase.com> for cross-region outages. The
[deep health probe](#tldr--where-to-look) catches PostgREST/DB-level
outages from our side, but not all of Supabase.

No alerting is wired into Supabase by default. Slow-query alerts can
be configured in the dashboard if a regression keeps happening.

---

## Email — Resend

Resend dashboard shows per-message delivery status (delivered /
bounced / complained). The notifications worker writes a row to
`notifications_outbox` per send, but the **deliverability outcome**
(soft bounce, hard bounce, spam complaint) lives on Resend's side.
Webhook back into our system isn't wired today — flagged as a
follow-up in the original [integrations doc](integrations.md).

---

## CI / smoke

| Workflow                                                                | When                            | What it watches                                                   |
| ----------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| [ci.yml](../.github/workflows/ci.yml)                                   | Every push to main/develop + PR | typecheck, lint, unit tests w/ coverage, build. **Blocks merge.** |
| [smoke-prod.yml](../.github/workflows/smoke-prod.yml)                   | Push to main                    | Playwright `public` project against production. Non-blocking.     |
| [e2e-develop.yml](../.github/workflows/e2e-develop.yml)                 | Push to develop                 | Full Playwright suite against staging.                            |
| [supabase-migrations.yml](../.github/workflows/supabase-migrations.yml) | Push to main                    | Applies new migrations. Blocks deploy if it fails.                |

GitHub Actions **Failed run** notifications go to the repo owner by
default — leave that on. A red `ci.yml` on a PR is self-evident; a
red `smoke-prod.yml` after a deploy means "go look now".

---

## See also

- [runbook.md](runbook.md) — incident playbooks.
- [api-reference.md](api-reference.md) — `/api/health`,
  `/api/health/deep`, `/api/sentry-test`.
- [integrations.md](integrations.md) — third-party service config + env vars.
- [ADR 0011](adr/0011-stripe-webhook-dedupe.md) — Stripe webhook log
  table.
