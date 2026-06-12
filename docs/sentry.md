# Sentry — audit, views, alerts & Discord

Operational guide for the Sentry integration. The **SDK wiring** is documented
in [integrations.md § Sentry](integrations.md#sentry); this doc covers what to
configure **inside the Sentry dashboard** (saved searches, dashboards, alert
rules, Discord) plus the two small code changes that make those views reliable.

Audit findings are tracked in
[docs/audits/third-party-integrations.md](audits/third-party-integrations.md)
(the `TPI-*` series). This file is the "how to operate it" companion.

---

## 1. Current state (what's already wired)

The code side is in good shape. For reference when configuring the dashboard:

| Concern          | Where                                                                                                               | Behaviour                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Client SDK       | [instrumentation-client.ts](../apps/web/instrumentation-client.ts)                                                  | DSN-gated; prod traces 2%; on-error replay 0.3, `maskAllText` + `blockAllMedia`            |
| Server SDK       | [sentry.server.config.ts](../apps/web/sentry.server.config.ts)                                                      | `tracesSampler` → prod 2%, **drops `/api/notifications/*` cron transactions**              |
| Edge SDK         | [sentry.edge.config.ts](../apps/web/sentry.edge.config.ts)                                                          | prod traces 2%                                                                             |
| Build plugin     | [next.config.mjs](../apps/web/next.config.mjs#L172-L191)                                                            | `withSentryConfig`: source-map upload, `/monitoring` tunnel (ad-blocker dodge), tree-shake |
| Error boundaries | [error.tsx](../apps/web/src/app/error.tsx), [global-error.tsx](../apps/web/src/app/global-error.tsx)                | `captureException` + GitHub-issue prefill                                                  |
| Log wrapper      | [lib/log.ts](../apps/web/src/lib/log.ts)                                                                            | `log.error/warn/info` + serverless `flush()`                                               |
| Noise filtering  | server/edge/client `beforeSend` + `ignoreErrors`                                                                    | drops e2e (`x-pickupvb-e2e`), bots (`navigator.webdriver`), and typed `DomainError`s       |
| Test harness     | [/sentry-test](../apps/web/src/app/sentry-test/) + [/api/sentry-test](../apps/web/src/app/api/sentry-test/route.ts) | cron-secret-gated trigger for client/server events                                         |

**Key consequence for triage:** typed domain errors (`NotFoundError`,
`ConflictError`, `CapacityExceededError`, `ValidationError`,
`UnauthorizedError`, `InvariantViolation`) are filtered out by `ignoreErrors`.
So **everything that reaches Sentry is genuinely unexpected** — there is no
"expected error" noise to wade through. Treat every unresolved issue as real.

### Environments

`environment` is set from `VERCEL_ENV` → one of `production`, `preview`,
`development`. **Always scope dashboard views and alerts to
`environment:production`** unless you're chasing a preview-deploy bug — preview
traffic (PR builds, your own testing) otherwise drowns the signal.

---

## 2. Two code changes that unlock reliable views — ✅ implemented 2026-06-11

The most useful Sentry views ("how many users hit this", "first seen in which
release", "is this a regression") depend on **release** and **user** tags. Both
were missing; both are now wired (audit findings TPI-15 / TPI-16). Documented
here so the _why_ survives.

### 2a. Pin the release to the deployed commit — TPI-15

The runtime `Sentry.init` calls now set `release` to the deployed commit so
events are tagged with the same release the source maps upload under (without
it, the Releases page / regression detection / source-map association are
unreliable):

- [sentry.server.config.ts](../apps/web/sentry.server.config.ts) /
  [sentry.edge.config.ts](../apps/web/sentry.edge.config.ts):
  `release: process.env.VERCEL_GIT_COMMIT_SHA`
- [instrumentation-client.ts](../apps/web/instrumentation-client.ts):
  `release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` (the client needs the
  `NEXT_PUBLIC_` copy — same mechanism Vercel uses for `NEXT_PUBLIC_VERCEL_ENV`)
- [next.config.mjs](../apps/web/next.config.mjs): the `withSentryConfig` plugin
  pins the **upload-side** release to the same SHA (`release: { name: … }`), so
  upload and runtime can't drift. Off Vercel it falls back to git-HEAD
  auto-detection.

**Verify after the next prod deploy:** open an issue in Sentry and confirm it
carries a `release` tag equal to the Vercel commit SHA, and that the stack trace
is de-minified (source maps applied).

### 2b. Attach an **opaque** user id (no PII) — TPI-16

Folded into the existing [auth-state-sync.tsx](../apps/web/src/components/auth-state-sync.tsx)
(the only app-wide auth subscription) rather than a second `getUser()` listener.
On every auth event it calls `Sentry.setUser({ id })` with **only the opaque
Supabase user id** (a UUID), and `Sentry.setUser(null)` on sign-out:

```ts
const nextUserId = session?.user?.id ?? null;
Sentry.setUser(nextUserId ? { id: nextUserId } : null);
```

Given the privacy posture (anonymous auth, salted PostHog ids, replay masks
everything) we send **no email/name**, and **never** set `sendDefaultPii: true`
(it defaults off and must stay off — it would attach IP + headers). Sentry can
now show "N users affected" and filter by user. (Server events stay
unattributed; add `Sentry.setUser({ id })` in a request scope / `log.error` if
that ever proves needed.)

---

## 3. Saved searches (Issue views)

Create these under **Issues → search bar → Save As**. They become one-click
filters. Exact query strings (Sentry search syntax):

| Name                     | Query                                                               | Why                                                               |
| ------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Prod — unresolved**    | `is:unresolved environment:production`                              | Your default triage list. Sort by **Events** or **Users**.        |
| **Prod — new (24h)**     | `is:unresolved environment:production firstSeen:-24h`               | What just started breaking. Pair with the "new issue" alert.      |
| **Regressions**          | `is:unresolved environment:production is:regressed`                 | Issues that came back after being resolved — highest priority.    |
| **Stripe / payments**    | `is:unresolved environment:production url:*/api/webhooks/stripe`    | Money path. A failure here = dropped charge / un-synced sub.      |
| **Server actions / RSC** | `is:unresolved environment:production transaction:*/events/*`       | Event flows (join, publish, registration) — the core product.     |
| **Cron / notifications** | `is:unresolved environment:production url:*/api/notifications/*`    | Reminder/worker failures are silent in prod (no user sees them).  |
| **This release**         | `is:unresolved environment:production firstSeen:-1d release:latest` | After a deploy, did you introduce anything new? (needs §2a.)      |
| **Affecting many users** | `is:unresolved environment:production timesSeen:>50`                | Triage by blast radius. (`is:assigned_or_suggested:me` to scope.) |

Tip: set **Prod — unresolved** as your default view (the ⭐). Sentry sorts by
"Events" by default; switch to **Users** once §2b lands to prioritise by people
affected rather than raw count (one looping client can dominate event count).

---

## 4. Dashboard widgets

**Dashboards → Create Dashboard → "PickupVB — Health"**. Suggested widgets
(all scoped `environment:production`):

1. **Errors over time** — Big Number + line, `event.type:error`, last 14d.
   Your at-a-glance "are we on fire" number.
2. **Top issues** — Table, columns `issue · events · users · firstSeen`,
   sorted by users desc. The triage queue as a tile.
3. **Errors by transaction** — Table grouped by `transaction`, error count.
   Surfaces which route/page/server-action is the hot spot.
4. **Errors by release** — Bar grouped by `release` (needs §2a). A tall new bar
   right after a deploy = you shipped a regression.
5. **Apdex / p95 transaction duration** — for the few sampled traces; pick the
   `/events/[id]` and `/api/webhooks/stripe` transactions. Watch for slow
   regressions, not absolute numbers (only 2% sampled in prod).
6. **Replays** — count of on-error replays (last 7d), as a quick link into the
   Replays tab for reproducing a gnarly client bug.
7. **Web Vitals** — if you wire the browser perf, LCP/CLS/INP p75. (We already
   collect web-vitals via [/api/web-vitals](../apps/web/src/app/api/web-vitals/route.ts);
   Sentry can show the SDK-measured ones independently.)

---

## 5. Alert rules

**Alerts → Create Alert**. Two kinds: **Issue alerts** (fire on issue
lifecycle) and **Metric alerts** (fire on a threshold over time). Start with
these four — route all of them to Discord (§6):

### A. New issue in production (Issue alert) — _the workhorse_

- **When:** _A new issue is created_
- **If:** `environment` equals `production`
- **Then:** notify Discord channel + (optionally) email.
- Rationale: because `ignoreErrors` already filters expected domain errors, a
  brand-new issue in prod is almost always a real, novel bug. This is the alert
  you actually want pinging Discord.

### B. Stripe webhook failure (Issue alert) — _money path_

- **When:** _An issue changes state from resolved to unresolved (regression)_
  **OR** _an event is seen_
- **If:** `environment` equals `production` **AND** the issue's `url` contains
  `/api/webhooks/stripe` (use a tag/`message` match if `url` isn't on the
  event). Tighten with "is seen more than **1** time in **1 minute**".
- **Then:** notify Discord with **@here** — a dropped `checkout.session.completed`
  means a paid registration never synced. Treat as page-worthy.

### C. Error-rate spike (Metric alert)

- **Metric:** number of errors, `environment:production`.
- **Threshold:** "more than **N** in **5 minutes**" — set N from your current
  baseline (check the dashboard; start ~10–20× normal). Critical + warning
  levels.
- **Then:** Discord. Catches a deploy that broke a whole flow at once, even when
  every individual issue is "old".

### D. Cron / worker silence (optional, Issue alert or Cron Monitor)

- The notification/reminder crons fail **silently** (no user sees a missing
  reminder). Either:
  - an Issue alert filtered to `url:*/api/notifications/*`, or
  - better: a **Sentry Cron Monitor** with check-ins from the worker (the SDK's
    `Sentry.captureCheckIn`) so you alert on a **missed** run, not just a thrown
    error. Wire a check-in at the top/bottom of
    [/api/notifications/worker](../apps/web/src/app/api/notifications/worker/route.ts).

**Noise control:** every rule should have an **interval / digest** ("notify at
most once per N minutes per issue") so an error storm doesn't flood Discord. The
new-issue alert (A) is naturally rate-limited because it only fires once per
_new_ issue.

---

## 6. Discord notifications

Two ways to get Sentry → Discord. **Use the native integration** — it renders
proper embeds and needs zero code. The webhook relay is the fallback if the
native integration isn't available on your plan.

### Option 1 — Native Sentry ↔ Discord integration (recommended)

1. In Discord, you need **Manage Server** on the target server.
2. Sentry → **Settings → Integrations → Discord → Add to Server** (or "Install").
   Authorize, pick the Discord **server**.
3. Sentry installs its bot into the server. Make sure the bot can post in the
   channel you want (e.g. `#alerts` / `#prod-errors`) — give it
   _View Channel_ + _Send Messages_ (and _Embed Links_).
4. In each **Alert rule** (§5), add an action:
   **"Send a notification to the `<your-server>` Discord server, channel
   `#prod-errors`"**. You can also add a Discord action to issue **assignment**
   so ownership pings the right person.

That's it — alerts arrive as rich embeds with the title, culprit, count, and a
deep link into the issue. No code, no relay to maintain.

> If "Discord" doesn't appear under Integrations, it may be gated to a paid
> Sentry plan (Team+). In that case use Option 2.

### Option 2 — Webhook relay through our own API route (fallback)

Sentry's generic "webhook" alert action posts **Sentry's** JSON shape, which
Discord won't render (Discord's incoming webhooks expect their own
`{ embeds: [...] }` shape). So you bridge with a tiny serverless route that
transforms one into the other. We already run Vercel functions, so this is a
natural home — and it means the Discord webhook URL never leaves our backend.

1. Discord: **Server Settings → Integrations → Webhooks → New Webhook**, pick
   the channel, **Copy Webhook URL**. Store it as `DISCORD_ALERTS_WEBHOOK_URL`
   in Vercel env (server-only — **not** `NEXT_PUBLIC_`).
2. Add a route `apps/web/src/app/api/sentry-webhook/route.ts` that:
   - verifies the request is from Sentry (Sentry signs payloads with
     `Sentry-Hook-Signature` using your integration's client secret — verify
     it, or at minimum gate on a shared secret in the URL/query),
   - maps the Sentry payload (`data.event`/`data.issue`, `url`, `title`,
     `culprit`) into a Discord embed, and
   - `POST`s it to `DISCORD_ALERTS_WEBHOOK_URL`.
3. In Sentry, create an **Internal Integration** (Settings → Developer Settings
   → Internal Integration) with a webhook URL of
   `https://pickupvb.com/api/sentry-webhook`, subscribe it to **issue** and
   **error** alerts, then reference it as an action in your alert rules.

This is more moving parts than Option 1 — only reach for it if the native
integration isn't available. **I can build this route** (signature
verification + embed mapping) if you decide to go this way; say the word and
which env it lands in.

---

## 7. Triage runbook (once alerts are flowing)

1. Discord ping → click through to the Sentry issue.
2. Check **environment** (ignore `preview` unless it's a PR you're reviewing).
3. Look at **release** (§2a) — did this start with the last deploy? If yes and
   it's bad, **revert the deploy** first, fix second.
4. Use the **replay** (if attached) or breadcrumbs to reproduce. Remember
   replay masks all text/media, so you see structure, not content.
5. **Stripe webhook errors are special** — cross-check the Stripe dashboard's
   webhook delivery log; Stripe retries failed webhooks, so a transient blip may
   self-heal, but a code bug will fail every retry.
6. Resolve the issue in Sentry when fixed — if it recurs, it'll show up in the
   **Regressions** saved search (§3), which is your highest-priority bucket.

---

## Cross-references

- SDK env vars + wiring: [integrations.md § Sentry](integrations.md#sentry)
- Audit findings (TPI series): [audits/third-party-integrations.md](audits/third-party-integrations.md)
- Incident / on-call context: [runbook.md](runbook.md)
