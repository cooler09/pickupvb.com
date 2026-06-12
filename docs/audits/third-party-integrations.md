# Third-Party Integrations Audit

**Date:** 2026-05-31
**Scope:** Every external/vendor integration the app talks to over the network —
Stripe, Supabase (DB / Auth / Storage / **Realtime**), Sentry, PostHog, Resend,
Web Push (VAPID), Cloudflare Turnstile, OpenStreetMap **Nominatim** + **Photon**
(geocoding), OpenStreetMap **tile server** (Leaflet), and the Vercel **Cron**
workers that drive them.

**Lens:** gaps / bugs, optimizations, and — the explicit ask — **usage & cost at
scale**. Findings are graded P1/P2/P3 per
[the audits rubric](README.md#how-findings-are-graded). Each has a file link and
a concrete fix. Several items overlap existing audits
([performance](performance.md), [analytics](analytics.md),
[monetization](monetization.md), [security](security.md)) — cross-referenced
where relevant, but kept here under the vendor-cost lens.

---

## Status — 2026-06-11 (Sentry re-scan)

Focused re-scan of the **Sentry** integration (code wiring is mature — DSN
gating, tunnel route, source-map upload, `tracesSampler` cron drops, e2e/bot
filtering, masked on-error replay, serverless `flush()` are all in place).
Three operational gaps opened, none ship-blocking: **TPI-15** (P2 — runtime
inits don't pin `release`), **TPI-16** (P3 — no `Sentry.setUser` opaque id),
**TPI-17** (P2, config-only — no alert rules / Discord routing). New operating
guide written at [docs/sentry.md](../sentry.md) (saved searches, dashboards,
alert rules, Discord setup, triage runbook). Also fixed doc drift in
[integrations.md](../integrations.md) (`sentry.client.config.ts` →
`instrumentation-client.ts`).

## Status — 2026-05-31 (Tier 1 fixes landed)

**Resolved (Tier 1 quick wins):** TPI-4 (Stripe `apiVersion` pinned to the
SDK-bundled `2026-04-22.dahlia`, now a typecheck tripwire on bumps), TPI-5
(checkout idempotency keys on all four destination-charge flows + the shared
helper), TPI-8 (Resend `Idempotency-Key` = outbox row id, pinned by a new
`email-resend.test.ts`), TPI-10 (client Sentry traces 10%→2%), TPI-12 (server
`tracesSampler` drops the `/api/notifications/*` cron transactions).

**TPI-9 resolved independently** by the ADR 0026 worker rewrite — the worker now
drains the _whole_ backlog per wake (loop bounded by `DRAIN_BUDGET_MS`) with a
debounced DB kick as the primary trigger, so `BATCH=50` is a per-claim size, not
a per-invocation ceiling. The `*/5` cron is now a safety-net sweep. No change
needed.

**TPI-14 also resolved** (2026-05-31, separate bundle) — the reminders cron now
caps reminders per run + fans out with bounded concurrency, so a timeout can't
strand a marked-but-undelivered tail; orchestration extracted to a testable
`sweep.ts`. See the remediation log.

**TPI-7 resolved** (2026-05-31, [ADR 0027](../adr/0027-realtime-broadcast-notifications.md))
— the notification bell moved off `postgres_changes` to a per-user **private
Broadcast channel** fed by a DB trigger; **verified live on dev** (the quad
couldn't exercise the realtime/RLS/trigger path). Discovery: `notifications` was
never in the `supabase_realtime` publication, so the old path was inert anyway.

**TPI-1 + TPI-2 + TPI-3 resolved** (2026-05-31, **MapTiler**) — address
autocomplete + server geocode now route through MapTiler when keyed (OSM only as
the no-key dev fallback), and the map serves MapTiler tiles. Shared client +
unit-tested parser in `lib/maptiler.ts`; CSP + `.env.example` + integrations doc
updated.

**TPI-6 + TPI-11 + TPI-13 resolved** (2026-05-31, P3 bundle) — webhook now
dedupes on `processed_at` so a crashed claim is re-driven, not lost (+ test);
Sentry on-error replay rate trimmed 1.0 → 0.3 to bound quota; PostHog `flushAt:1`
closed as working-as-intended (the serverless safety default).

Verify quad green (web 98 tests; lint 0 errors; build 8/8).
**Audit fully remediated — every finding resolved or closed, including TPI-7
(verified live on dev). 0 P1 · 0 P2 · 0 P3 outstanding.** Optional, non-finding
follow-ups remain (TPI-7 tab-visibility gating; an edge `s-maxage` cache on the
geocoding proxy; a realtime e2e).

---

## Status — 2026-05-31 (initial audit)

Opened **0 P1 · 5 P2 · 9 P3**. Headline: the integration plumbing is genuinely
well-built (signature verification, idempotency logs, consent gating, salted
actor hashing, endpoint pruning, retry/backoff) — there are **no ship-blocking
bugs**. The risk is concentrated in **two scale cliffs that are invisible at
today's volume**:

1. **Free OpenStreetMap services on hot paths** — address _typeahead_ hits
   Nominatim/Photon (TPI-1) and the map ships OSM's public tile server (TPI-3).
   Both have fair-use policies that explicitly forbid the way we're using them;
   they don't bill you, they **block your egress IPs**, at which point address
   entry and maps break in production with no code change on our side.
2. **Per-user Supabase Realtime via `postgres_changes`** (TPI-7) — every
   logged-in tab holds a concurrent Realtime connection on a feature
   (`postgres_changes`) Supabase itself documents as the non-scaling path. This
   is the single biggest concurrent-connection + cost lever before launch.

The in-flight working-tree changes (Sentry `tracesSampleRate` 10%→2% on
server/edge; notification worker cron `* * * * *`→`*/5`) are **good cost moves**
— this audit validates them and flags the two follow-ups they left behind
(TPI-5 client sample-rate drift, TPI-9 worker throughput ceiling).

---

## Integration inventory

| Vendor / service                       | Entry point                                                                                                                                                                                             | Billing model                    | Hot path?              | Findings                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------- | -------------------------- |
| **Stripe**                             | [lib/stripe.ts](../../apps/web/src/lib/stripe.ts), [webhooks/stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts), [checkout-session.ts](../../apps/web/src/lib/checkout-session.ts)   | per-txn % + fee                  | checkout only          | TPI-4, TPI-5, TPI-6        |
| **Supabase DB/Auth**                   | [lib/supabase.ts](../../apps/web/src/lib/supabase.ts), [supabase/admin.ts](../../packages/supabase/src/admin.ts)                                                                                        | compute + egress                 | every request          | (covered by perf/security) |
| **Supabase Realtime**                  | [notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx), [live-scores-provider.tsx](../../apps/web/src/app/events/[id]/_components/live-scores-provider.tsx), bracket watchers     | concurrent peak conns + messages | every logged-in page   | **TPI-7**                  |
| **Sentry**                             | [instrumentation-client.ts](../../apps/web/instrumentation-client.ts), [sentry.server.config.ts](../../apps/web/sentry.server.config.ts), [sentry.edge.config.ts](../../apps/web/sentry.edge.config.ts) | spans + replays + errors quota   | every request          | TPI-10, TPI-11, TPI-12     |
| **PostHog**                            | [posthog-analytics.ts](../../packages/infrastructure/src/posthog-analytics.ts), [lib/analytics.ts](../../apps/web/src/lib/analytics.ts)                                                                 | per event ingested               | per capture            | TPI-13                     |
| **Resend (email)**                     | [email-resend.ts](../../apps/web/src/lib/email-resend.ts)                                                                                                                                               | per email                        | cron worker            | TPI-8                      |
| **Web Push (VAPID)**                   | [web-push.ts](../../apps/web/src/lib/web-push.ts)                                                                                                                                                       | free (browser push services)     | cron worker            | ✅ solid                   |
| **Cloudflare Turnstile**               | [lib/turnstile.ts](../../apps/web/src/lib/turnstile.ts)                                                                                                                                                 | free                             | guest signup / tips    | ✅ solid                   |
| **OSM Nominatim + Photon (geocoding)** | [geocode/autocomplete/route.ts](../../apps/web/src/app/api/geocode/autocomplete/route.ts), [lib/geocode.ts](../../apps/web/src/lib/geocode.ts)                                                          | **free, fair-use capped**        | **address typeahead**  | **TPI-1**, TPI-2           |
| **OSM tile server (Leaflet)**          | [event-map.tsx](../../apps/web/src/components/event-map.tsx)                                                                                                                                            | **free, fair-use capped**        | event detail page      | **TPI-3**                  |
| **Vercel Cron**                        | [vercel.json](../../apps/web/vercel.json), worker/reminders/outbox-purge routes                                                                                                                         | per invocation + function GB-s   | every 5/15 min + daily | TPI-8, TPI-9               |

---

## Findings

### Geocoding — OpenStreetMap Nominatim + Photon

#### TPI-1 (P2) — ✅ Resolved 2026-05-31 — Address typeahead runs against free OSM endpoints that forbid autocomplete

[apps/web/src/app/api/geocode/autocomplete/route.ts](../../apps/web/src/app/api/geocode/autocomplete/route.ts#L17-L25)
proxies every address keystroke (after a 400 ms / 3-char client debounce in
[address-autocomplete.tsx](../../apps/web/src/components/address-autocomplete.tsx#L35-L65))
to **Photon** (komoot's public instance) with a **Nominatim** fallback.

- **Nominatim's usage policy explicitly prohibits autocomplete** and caps usage
  at **1 request/second** absolute. Using it as the typeahead fallback is a
  direct ToS violation.
- **Photon's public instance** is documented "for low-volume use; host your own
  for heavy use."
- The client hygiene is good (debounce, min length, `AbortController`), but the
  route is `force-dynamic` and typeahead prefixes are highly diverse, so the
  upstream `next: { revalidate: 3600 }` cache rarely hits. Volume scales ~linearly
  with address-entry sessions.

**Why it bites at scale, not today:** these services don't send a bill — they
**rate-limit / IP-ban the caller**. Vercel's shared egress IPs hitting Nominatim
with autocomplete traffic will get `429`/`403`, and address entry silently
degrades to the empty-suggestions path for _all_ users on that IP.

**Fix (shipped 2026-05-31 — MapTiler):** autocomplete now routes through MapTiler
geocoding when `MAPTILER_API_KEY` is set; the Photon→Nominatim chain stays only as
the no-key dev fallback (never prod volume). On a MapTiler outage prod degrades to
empty suggestions (manual entry), not back to OSM. Shared client +
response-parser in [lib/maptiler.ts](../../apps/web/src/lib/maptiler.ts)
(parser unit-tested in
[maptiler.test.ts](../../apps/web/src/lib/maptiler.test.ts), 5 cases), consumed by
[the route](../../apps/web/src/app/api/geocode/autocomplete/route.ts). Edge
`s-maxage` caching on the proxy remains an optional follow-up.

#### TPI-2 (P3) — ✅ Resolved 2026-05-31 — Server-side event geocode also uses Nominatim

[apps/web/src/lib/geocode.ts](../../apps/web/src/lib/geocode.ts) geocodes the
address once on event create/edit. Now routes through MapTiler
(`maptilerGeocodeOne`) when keyed, Nominatim only as the no-key dev fallback —
same vendor, key, and rate budget as TPI-1 (resolved in the same bundle).

### Map tiles — OpenStreetMap tile server

#### TPI-3 (P2) — ✅ Resolved 2026-05-31 — Leaflet ships OSM's public tile server `{s}.tile.openstreetmap.org`

[apps/web/src/components/event-map.tsx](../../apps/web/src/components/event-map.tsx#L36-L39)
points `TileLayer` at `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. The
**OSM Tile Usage Policy** prohibits "heavy use" / systematic bulk downloading and
expects production apps to use a commercial or self-hosted tile source; the `{s}`
subdomain-rotation scheme is also deprecated. Same failure mode as TPI-1 —
tiles get throttled/blocked, not billed, and the map breaks for everyone on the
egress IP.

**Fix (shipped 2026-05-31):** [event-map.tsx](../../apps/web/src/components/event-map.tsx)
now serves **MapTiler** raster tiles (`streets-v2`) when `NEXT_PUBLIC_MAPTILER_KEY`
is set, with `maxZoom` + MapTiler/OSM attribution; the OSM tile URL stays as the
no-key dev fallback. CSP `img-src` gained `https://api.maptiler.com`. (The perf
bonus was already in place — `EventMap` is dynamic-imported `ssr:false` via
`event-map-lazy.tsx`.)

### Stripe

#### TPI-4 (P2) — ✅ Resolved 2026-05-31 — Stripe client pins no `apiVersion`

[apps/web/src/lib/stripe.ts](../../apps/web/src/lib/stripe.ts#L27-L33) constructs
`new Stripe(key, { typescript: true, maxNetworkRetries: 2 })` and deliberately
lets the SDK choose its bundled API version. That means a routine
`pnpm up stripe` silently moves the API version your **webhook payloads** and API
responses are parsed against — Connect account fields, Checkout Session shapes,
and subscription objects can change between versions, breaking
[webhooks/\*](../../apps/web/src/lib/webhooks/) handlers with **no diff in our
code**. The comment frames version-floating as a type-safety feature; for a
payment integration it's a latent break.

**Fix:** pin `apiVersion: '2025-xx-xx'` explicitly and treat bumps as deliberate,
tested changes (verify the [webhook handler](../../apps/web/src/lib/webhooks/)
payload shapes against the new version). `maxNetworkRetries: 2` is good; keep it.

#### TPI-5 (P3) — ✅ Resolved 2026-05-31 — Checkout Session creates pass no `idempotencyKey`

[lib/checkout-session.ts](../../apps/web/src/lib/checkout-session.ts#L42-L56),
[profile/billing/pro/actions.ts](../../apps/web/src/app/profile/billing/pro/actions.ts),
and [edit/sponsor-actions.ts](../../apps/web/src/app/events/[id]/edit/sponsor-actions.ts)
call `stripe.checkout.sessions.create(...)` with no idempotency key. A
double-click or a retried server action creates **duplicate Checkout Sessions**
(and, for the Pro/subscription flow, potential duplicate subscriptions). The
webhook handlers are idempotent at the data layer, so a duplicate _charge_ is
unlikely — but duplicate sessions/subscriptions are reachable.

**Fix:** pass a deterministic second arg `{ idempotencyKey }` derived from
`(userId, eventId, kind, amountCents)`. Stripe dedupes server-side for 24 h.

#### TPI-6 (P3) — ✅ Resolved 2026-05-31 — Webhook event can be orphaned if the function dies between dedup-insert and processing

[webhooks/stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts#L72-L115)
inserts the dedup row _before_ dispatching, then `delete`s it if the handler
throws so Stripe retries. Correct for normal errors — but if the lambda is killed
(timeout/OOM) _after_ the insert and _before_ the delete, the event id is
permanently in `stripe_webhook_events` with `processed_at = NULL`, so the Stripe
retry is deduped at line 89 and the event is **silently dropped**. Low
probability (handlers are fast, the code even comments the awkwardness) but it's
a real data-loss seam on the payments path.

**Fix (shipped 2026-05-31):** dedupe on `processed_at`, not row existence. The
route now treats the claim row as a _claim_ — on a redelivery it reads
`processed_at` and only returns `deduped` when it's set; a row stuck at
`processed_at IS NULL` (a crashed claim) is **re-driven** on the next Stripe
retry. Decision extracted to a pure
[lib/webhooks/idempotency.ts](../../apps/web/src/lib/webhooks/idempotency.ts)
(`decideWebhookProcessing`) + test
[idempotency.test.ts](../../apps/web/src/lib/webhooks/idempotency.test.ts) (3
cases incl. the orphan-re-drive regression guard). Handlers are idempotent, so
re-driving an orphan — or the rare concurrent double-delivery this also lets
through — is safe.

### Telemetry — Sentry

#### TPI-10 (P3) — ✅ Resolved 2026-05-31 — Client `tracesSampleRate` still 10% after server/edge were trimmed to 2%

The working-tree change drops
[sentry.server.config.ts](../../apps/web/sentry.server.config.ts#L11) and
[sentry.edge.config.ts](../../apps/web/sentry.edge.config.ts) to `0.02` in prod,
but [instrumentation-client.ts](../../apps/web/instrumentation-client.ts#L10) is
still `0.1`. Browser pageload/navigation transactions are typically the
**highest-volume** span stream, so the client is now the dominant cost the trim
was meant to address. Align it (e.g. `0.02–0.05`), or use a `tracesSampler` to
keep checkout/critical routes sampled higher and everything else low.

#### TPI-11 (P3) — ✅ Resolved 2026-05-31 — Sentry Replay integration is bundled for every visitor though session replay is off

[instrumentation-client.ts](../../apps/web/instrumentation-client.ts) registers
`replayIntegration` with `replaysSessionSampleRate: 0` /
`replaysOnErrorSampleRate: 1.0`. Replay only _activates_ on errors, but the
integration ships to every page load.

**Resolution:** lowered `replaysOnErrorSampleRate` 1.0 → **0.3** to bound
replay-quota cost during an error spike (the cost-at-scale lever). The bundle
weight is **kept** — lazy-loading was investigated and rejected: on-error replay
must buffer from page load to capture the pre-error session, so it can't be
deferred without losing the feature. On-error session replays remain a deliberate
debugging tool; 30% of error sessions are recorded.

#### TPI-12 (P3) — ✅ Resolved 2026-05-31 — No `tracesSampler` to zero-out cron/health transactions

The three cron routes (worker/reminders/outbox-purge) each open a server
transaction at the sampled rate every 5/15 min / daily — pure noise. Add a
`tracesSampler` in [sentry.server.config.ts](../../apps/web/sentry.server.config.ts)
returning `0` for `transactionContext.name?.startsWith('/api/notifications/')`.

#### TPI-15 (P2) — 🔶 Open 2026-06-11 — Runtime `Sentry.init` calls don't pin `release`

[sentry.server.config.ts](../../apps/web/sentry.server.config.ts),
[sentry.edge.config.ts](../../apps/web/sentry.edge.config.ts), and
[instrumentation-client.ts](../../apps/web/instrumentation-client.ts) set
`dsn` / `environment` / sampling but **never set `release`**. The
`withSentryConfig` plugin proposes a release from `git HEAD` for the
source-map upload, but if the runtime events carry no `release` tag (or a
different one), the **Releases** page, regression detection, "first seen in
`<sha>`", and reliable source-map association all degrade. This is the
backbone of post-deploy triage.

**Fix:** add `release: process.env.VERCEL_GIT_COMMIT_SHA` to the server/edge
inits and `release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` to the
client init (Vercel exposes both). See
[docs/sentry.md § 2a](../sentry.md). Verify in the Sentry UI that events
carry a `release` after the next deploy.

#### TPI-16 (P3) — 🔶 Open 2026-06-11 — No user context attached to events (`Sentry.setUser`)

No `Sentry.setUser(...)` anywhere
(`grep setUser` over `apps/web` is empty), so issues arrive with no user
identity. You can't see "N users affected", can't sort triage by blast
radius (users vs. raw event count), and can't filter by user. The privacy
posture (anon auth, salted PostHog ids, replay masks everything) means the
**only** safe value to attach is the opaque Supabase user id (a UUID) — never
email/name, and never `sendDefaultPii: true`.

**Fix:** mount a small `'use client'` setter in the root layout that calls
`Sentry.setUser({ id })` from `supabase.auth.getUser()` (and `setUser(null)`
on sign-out). See [docs/sentry.md § 2b](../sentry.md).

#### TPI-17 (P2) — 🔶 Open 2026-06-11 (ops/config, no code) — Errors flow to Sentry but nothing routes them to a human

The SDK captures cleanly and `ignoreErrors` already strips expected
`DomainError`s — so every Sentry issue is a real bug — but there are **no
alert rules and no Discord/email routing configured** in the Sentry project.
A new prod bug sits unseen until someone opens the dashboard. Highest-value
gap given how clean the captured signal is.

**Fix:** configure the four alert rules (new-issue, Stripe-webhook,
error-rate spike, cron silence) and a Discord destination per
[docs/sentry.md §§ 5–6](../sentry.md). Dashboard config only — no code,
unless the webhook-relay fallback (Option 2) is chosen over the native
Discord integration.

### Telemetry — PostHog

#### TPI-13 (P3) — ✅ Closed 2026-05-31 (working as intended) — `flushAt: 1` issues one HTTP request per captured event

[posthog-analytics.ts](../../packages/infrastructure/src/posthog-analytics.ts#L51-L61)
sets `flushAt: 1, flushInterval: 0`. This is **correct and necessary** for
serverless (without it, captures are dropped when the lambda freezes — the
documented bundle-101 fix, pinned by
[analytics.test.ts](../../apps/web/src/lib/analytics.test.ts)). But when one
request captures several events it fires N separate flushes instead of one
batch. PostHog bills per _event ingested_ (so no ingest-cost change), but each
flush extends the invocation via `after()` and adds outbound requests.

**Resolution — closed wontfix (working as intended):** keep `flushAt: 1`. It's
the documented serverless safety default; request-level batching would risk
re-introducing the silent event-drop bug (`analytics.test.ts` exists precisely to
guard it) for a negligible gain — PostHog bills per event ingested, so the only
"cost" is a few extra outbound HTTP requests on the rare multi-capture request.
Not worth the regression risk. Re-open only if a profile shows the extra flushes
materially extending invocation time.

### Supabase Realtime

#### TPI-7 (P2) — ✅ Resolved 2026-05-31 (verified live on dev) — Per-user Realtime connection on every page, over the non-scaling `postgres_changes` path

[notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx#L53-L81)
opens a Supabase Realtime channel subscribed to `postgres_changes` INSERTs on
`notifications` filtered by `user_id`, and the bell is mounted in
[site-header.tsx](../../apps/web/src/components/site-header.tsx) — i.e. **every
logged-in page**. Live scores ([live-scores-provider.tsx](../../apps/web/src/app/events/[id]/_components/live-scores-provider.tsx))
and the bracket watchers add more channels on event pages.

Two scale problems:

- **Concurrent connections = concurrent active tabs.** Channels multiplex over
  one socket per client (good), but that's still one concurrent Realtime
  connection per active user. Supabase Pro defaults to ~500 concurrent
  connections before add-on billing; a few hundred simultaneous users saturate
  it.
- **`postgres_changes` is the path Supabase explicitly says not to scale on** —
  it re-evaluates RLS _per subscriber per change_ on a single replication
  stream. With many subscribers on `notifications`, throughput and latency
  degrade. Supabase's own guidance is to use **Broadcast** for fan-out at scale.

**Fix (highest scale ROI here):** migrate notification + live-score fan-out from
`postgres_changes` to Realtime **Broadcast** — a DB trigger calling
`realtime.broadcast_changes(...)` into a per-user/per-event topic, consumed with
`channel.on('broadcast', ...)`. Cheaper per message, no per-subscriber RLS
evaluation. Tactical mitigations meanwhile: gate the bell subscription on
`document.visibilityState === 'visible'` so backgrounded tabs drop their
connection, and consider polling (the bell is low-urgency) instead of a
persistent socket.

**Shipped (the bell) 2026-05-31 — verified live on dev ([ADR 0027](../adr/0027-realtime-broadcast-notifications.md)):**
the notification bell now subscribes to a **private Broadcast channel**
`notifications:{userId}`, fed by an `AFTER INSERT` trigger
([20260823000000_notification_broadcast.sql](../../supabase/migrations/20260823000000_notification_broadcast.sql))
that calls `realtime.broadcast_changes(...)`; a `realtime.messages` SELECT policy
authorizes each user to their own topic. **Discovery during the work:**
`public.notifications` is **not in the `supabase_realtime` publication** in any
migration, so the prior `postgres_changes` path was inert in a
migration-provisioned DB — Broadcast both fixes the live path _and_ removes the
non-scaling subscription. **Scope = bell only:** `match_live_scores` stays on
`postgres_changes` (deliberate per its own migration) and the bracket watchers are
event-scoped. **Verified live on dev** — a notification increments the bell badge
live, and a _different_ user does not receive it (RLS topic isolation). Degrades
gracefully if misconfigured (notifications still persist + render on next load).
Tab-visibility gating + an e2e remain optional follow-ups.

### Notifications / Vercel Cron workers

#### TPI-8 (P3) — ✅ Resolved 2026-05-31 — Outbox email send has no provider idempotency key → duplicate emails on retry

[worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts#L58-L67)
calls `sendEmail` then `outbox.markSent`. If the email is sent but the worker
dies before `markSent`, the row is retried and Resend sends the email **again**.
[email-resend.ts](../../apps/web/src/lib/email-resend.ts#L39-L52) sets no
idempotency header. (Web-push duplicates are benign; email duplicates are
user-visible.)

**Fix:** pass `Idempotency-Key: <outbox row id>` to the Resend API (it supports
the header). The same row-id key documents at-least-once intent for push too.

#### TPI-9 (P3) — ✅ Resolved 2026-05-31 (ADR 0026) — Worker throughput ceiling

_Original concern:_ with a single `claimBatch(50)` per invocation and the cron
moved to `*/5`, steady-state throughput would cap at ~600 notifications/hour and
a large reminder blast would lag.

**Resolved by the ADR 0026 worker rewrite** — the `GET` handler now loops
`drainOneBatch` until the queue is empty, bounded by `DRAIN_BUDGET_MS` (50 s)
rather than a single batch, and a debounced DB kick is the primary trigger
([worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts#L188-L220)).
`BATCH = 50` is now the per-claim round-trip size, **not** a per-invocation
ceiling, so there's no throughput cliff. The `*/5` cron is a safety-net sweep.
No code change from this audit.

#### TPI-14 (P2) — ✅ Resolved 2026-05-31 — Reminders cron marks-sent-first then dispatches sequentially inside one 60 s function, with no row cap

[reminders/route.ts](../../apps/web/src/app/api/notifications/reminders/route.ts#L65-L99)
loops events (N+1: one `event_participants` query per event), stamps
`reminder_*_sent_at` on **all** matched attendees _before_ the dispatch loop,
then calls `notify(...)` **sequentially** per attendee. Two issues at scale:

- **Timeout = silently dropped reminders.** Because rows are marked sent before
  enqueue, if the 60 s `maxDuration` is hit mid-loop the un-enqueued tail is
  marked sent but never delivered. The header documents at-most-once _by design_
  for partial failure, but a timeout makes the drop **unbounded** (a 1,000-attendee
  window could drop hundreds with no signal).
- **Sequential `notify` is wasted latency.** `notify` only inserts an outbox row
  (a DB write) — the external send + rate-limiting happen later in the worker —
  so the "dispatch sequentially to avoid hammering rate limits" comment doesn't
  apply here.

**Fix (shipped 2026-05-31):** added a hard per-run cap (`MAX_REMINDERS_PER_RUN`)
shared across both windows + bounded-concurrency fan-out, so a run always
finishes well inside `maxDuration` and a capped run defers the remainder to the
next 15-min cron instead of stranding a marked-but-undelivered tail. Mark-first
(at-most-once) is kept deliberately — both reminder kinds include the
**non-idempotent `in_app` channel** (`insertInApp` has no idempotency key), so an
enqueue-then-mark flip would duplicate bell entries on a re-fire. The
sequential-`notify` framing in the original finding was half-right: `notify` is
not just a DB insert — it does a per-user prefs read + an auth email lookup — so
the lever is bounded concurrency, not a cross-user batch insert (the per-user
email/in_app resolution isn't batchable through the outbox port). Orchestration
extracted into [sweep.ts](../../apps/web/src/app/api/notifications/reminders/sweep.ts)
behind an injected `ReminderPort` + dispatch fn (Next forbids non-handler exports
from `route.ts`), tested in
[sweep.test.ts](../../apps/web/src/app/api/notifications/reminders/sweep.test.ts).

---

## What's already solid (don't regress these)

- **Stripe webhook boundary** — signature verification, dedup via
  `upsert(..., { ignoreDuplicates: true })`, delete-on-handler-error so Stripe
  retries, `processed_at` audit stamp. Idiomatic and correct (modulo TPI-6's
  rare crash window).
- **Web Push** — parallel `allSettled` fan-out, prunes `404/410` (gone)
  endpoints, 24 h TTL, typed result. [web-push.ts](../../apps/web/src/lib/web-push.ts).
- **PostHog privacy + delivery** — salted sha256 actor hashing (raw user id never
  leaves the process), consent gate, and the `after()` flush that actually lands
  events on Vercel. [posthog-analytics.ts](../../packages/infrastructure/src/posthog-analytics.ts),
  [analytics.ts](../../apps/web/src/lib/analytics.ts).
- **Turnstile** — server-side `siteverify`, scoped to the abuse-prone surfaces
  (guest signup, tips). [turnstile.ts](../../apps/web/src/lib/turnstile.ts).
- **Resend adapter** — plain `fetch` (no SDK in the bundle), dev soft-fail so
  local iteration doesn't need a key. [email-resend.ts](../../apps/web/src/lib/email-resend.ts).
- **Supabase admin client** — `autoRefreshToken: false, persistSession: false`,
  the correct posture for a stateless service-role client.
  [admin.ts](../../packages/supabase/src/admin.ts).
- **Lazy Stripe init** — `getStripe()` doesn't construct until first use, so dev
  without keys doesn't crash on import. [stripe.ts](../../apps/web/src/lib/stripe.ts).

---

## Remediation log

**2026-05-31 — Tier 1 quick wins (5 findings) + TPI-9 confirmed resolved.**

- **TPI-4** — pinned `apiVersion: '2026-04-22.dahlia'` (the stripe@22.1.1
  bundled version) in [lib/stripe.ts](../../apps/web/src/lib/stripe.ts). The
  literal is typed against the SDK's `LatestApiVersion`, so a future
  `pnpm up stripe` fails typecheck here until the version is bumped
  deliberately and webhook payload shapes re-verified.
- **TPI-5** — added an optional `idempotencyKey` to
  [checkout-session.ts](../../apps/web/src/lib/checkout-session.ts) (passed as
  the `sessions.create` request-options arg) and wired all four destination
  charge flows to key on their pending payment row:
  `ticket:<participantId>` ([checkout-actions](../../apps/web/src/app/events/[id]/checkout-actions.ts)),
  `tip:<tipId>` ([tip-actions](../../apps/web/src/app/events/[id]/tip-actions.ts)),
  `team:<registrationId>` ([team-checkout-actions](../../apps/web/src/app/events/[id]/team-checkout-actions.ts)),
  `roster:<paymentId>` ([roster-team-checkout-actions](../../apps/web/src/app/events/[id]/roster-team-checkout-actions.ts)).
  Keyed on the row (not stable inputs) so legitimate repeat purchases still
  create distinct sessions.
- **TPI-8** — added `idempotencyKey` to
  [email-resend.ts](../../apps/web/src/lib/email-resend.ts) (forwarded as the
  Resend `Idempotency-Key` header) and pass the outbox row id from
  [worker/route.ts](../../apps/web/src/app/api/notifications/worker/route.ts).
  Pinned by a new
  [email-resend.test.ts](../../apps/web/src/lib/email-resend.test.ts) (2 tests:
  header forwarded when keyed, omitted otherwise).
- **TPI-10** — client `tracesSampleRate` 0.1 → 0.02 in
  [instrumentation-client.ts](../../apps/web/instrumentation-client.ts) to match
  the server/edge trim.
- **TPI-12** — replaced the flat server `tracesSampleRate` with a
  `tracesSampler` in
  [sentry.server.config.ts](../../apps/web/sentry.server.config.ts) that returns
  `0` for `/api/notifications/*` cron transactions, else the prod 2% / dev 100%
  rate.
- **TPI-9** — confirmed **already resolved** by the ADR 0026 worker rewrite
  (whole-backlog drain loop + debounced DB kick); no change made.

Verify quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(web 83 tests, lint 0 errors, build 8/8).

**2026-05-31 — TPI-14 (reminders cron) resolved.**

- Added `MAX_REMINDERS_PER_RUN` (250) + `DISPATCH_CONCURRENCY` (8) and a shared
  per-run budget across both reminder windows; each event's attendees are pulled
  with `.limit(remainingBudget)` so the overflow stays unmarked for the next run.
  Mark-first / at-most-once preserved (the `in_app` channel isn't idempotent).
- Extracted the orchestration into
  [sweep.ts](../../apps/web/src/app/api/notifications/reminders/sweep.ts)
  (`runReminderSweep` + `mapWithConcurrency` behind a `ReminderPort`);
  [route.ts](../../apps/web/src/app/api/notifications/reminders/route.ts) now only
  wires the Supabase-backed port + `notify` + auth.
- +7 tests in
  [sweep.test.ts](../../apps/web/src/app/api/notifications/reminders/sweep.test.ts)
  pinning: cap respected, **no attendee marked without being dispatched**
  (no-silent-drop invariant), mark-before-dispatch ordering, idempotency-key
  shape, cross-window budget sharing, and the concurrency bound. Verify quad
  green (web 90 tests).
- Side-note (not a bug): `events.location_city` / `location_region` are absent
  from the stale generated types, so the event query casts through a null-union
  exactly like the existing `rsvp-actions.ts` pattern — preserved verbatim.

**2026-05-31 — TPI-7 (notification bell) migrated to Broadcast — verified live on dev.**
[ADR 0027](../adr/0027-realtime-broadcast-notifications.md).

- New migration
  [20260823000000_notification_broadcast.sql](../../supabase/migrations/20260823000000_notification_broadcast.sql):
  `public.broadcast_notification()` SECURITY DEFINER trigger fn + `AFTER INSERT`
  trigger on `public.notifications` calling `realtime.broadcast_changes(...)` to
  the per-user topic `notifications:{user_id}`, and a `realtime.messages` SELECT
  policy authorizing each authenticated user to their own topic.
- [notification-bell.tsx](../../apps/web/src/components/notification-bell.tsx)
  rewired from `postgres_changes` to a `{ private: true }` Broadcast channel +
  `realtime.setAuth(session.access_token)`; stable topic (RLS match) with a
  `cancelled` guard for the strict-mode double-mount.
- **Discovery:** `public.notifications` is in no `supabase_realtime` publication,
  so the prior `postgres_changes` path was inert in a migration-provisioned DB —
  Broadcast fixes the live path _and_ removes the non-scaling subscription.
- **Scope = bell only.** `match_live_scores` stays on `postgres_changes`
  (deliberate per its migration); bracket watchers are event-scoped.
- Verify quad green (typecheck/lint/build; tests unchanged — realtime isn't
  unit-testable). **Verified live on dev** (2026-05-31): a notification increments
  the bell badge live, and a different user does not receive it (RLS topic
  isolation). Finding closed.

**2026-05-31 — TPI-1 + TPI-2 + TPI-3 (geocoding + map tiles) → MapTiler.**

- New [lib/maptiler.ts](../../apps/web/src/lib/maptiler.ts) — shared server
  geocoding client (`maptilerAutocomplete`, `maptilerGeocodeOne`) + a pure
  `parseMapTilerFeatures` parser, unit-tested in
  [maptiler.test.ts](../../apps/web/src/lib/maptiler.test.ts) (5 cases:
  `[lon,lat]` flip, context-id city/region/postal/country mapping, municipality
  fallback, city-level feature, dropped bad/empty rows).
- [autocomplete route](../../apps/web/src/app/api/geocode/autocomplete/route.ts)
  - [geocode.ts](../../apps/web/src/lib/geocode.ts) use MapTiler when
    `MAPTILER_API_KEY` is set; the OSM endpoints (Photon/Nominatim) stay only as the
    no-key dev fallback. Prod degrades to empty suggestions on a MapTiler outage,
    never back to OSM.
- [event-map.tsx](../../apps/web/src/components/event-map.tsx) serves MapTiler
  `streets-v2` tiles (`NEXT_PUBLIC_MAPTILER_KEY`) with `maxZoom` + attribution,
  OSM tiles as the dev fallback. CSP `img-src` += `https://api.maptiler.com`.
- Two keys by design (server geocoding `MAPTILER_API_KEY` vs. browser-restricted
  `NEXT_PUBLIC_MAPTILER_KEY`) — documented in `.env.example` + `docs/integrations.md`.
- Vitest: aliased `server-only` to a stub so server modules (maptiler/stripe) are
  unit-testable. Verify quad green (web 95 tests, lint 0 errors, build 8/8).
- **Live check owed:** set both keys on dev, confirm typeahead returns MapTiler
  results and the event map renders MapTiler tiles.

**2026-05-31 — P3 bundle (TPI-6, TPI-11, TPI-13) — every finding now closed.**

- **TPI-6** — Stripe webhook dedupes on `processed_at`, not row existence: a
  claim row stuck at `processed_at IS NULL` (crashed mid-handler) is re-driven on
  the next Stripe retry instead of silently dropped. Decision extracted to a pure
  [lib/webhooks/idempotency.ts](../../apps/web/src/lib/webhooks/idempotency.ts) +
  test (3 cases, incl. the orphan-re-drive regression guard). Idempotent handlers
  make the re-drive (and the rare concurrent double-delivery it allows) safe.
- **TPI-11** — `replaysOnErrorSampleRate` 1.0 → 0.3 in
  [instrumentation-client.ts](../../apps/web/instrumentation-client.ts) to bound
  replay-quota cost on an error spike. Bundle weight kept — lazy-loading would
  lose on-error replay (it must buffer from page load). User chose keep+lower.
- **TPI-13** — closed **working-as-intended**: `flushAt: 1` is the documented
  serverless safety default; batching risks re-introducing the silent
  event-drop bug for negligible gain (PostHog bills per event, not per request).
  No code change.

Verify quad green (web 98 tests, lint 0 errors, build 8/8).

**Nothing open.** 0 P1 · 0 P2 · 0 P3 — every finding resolved or closed, TPI-7
included (verified live on dev 2026-05-31). Optional, non-finding follow-ups
remain: TPI-7 tab-visibility gating, an edge `s-maxage` cache on the geocoding
proxy, and a realtime e2e.
