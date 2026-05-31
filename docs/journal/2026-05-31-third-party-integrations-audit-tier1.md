# Third-party integrations audit + Tier 1 hardening (2026-05-31)

## Context

Asked for an audit of every external/vendor integration — gaps, bugs,
optimizations, and specifically **usage & cost at scale**. No prior
`third-party-integrations` audit existed; the surface cross-cuts performance,
analytics, monetization, and security audits but the vendor-cost lens is
distinct, so it got its own file: [docs/audits/third-party-integrations.md](../audits/third-party-integrations.md).

Inventory: Stripe, Supabase (DB/Auth/Storage/Realtime), Sentry, PostHog, Resend,
Web Push, Cloudflare Turnstile, OSM Nominatim+Photon (geocoding), OSM tiles
(Leaflet), Vercel Cron. Opened **0 P1 · 5 P2 · 9 P3** — no ship-blocking bugs;
the plumbing is well-built. Risk concentrates in two scale cliffs invisible at
today's volume: (1) free OSM services on hot paths (address typeahead +
map tiles) that **IP-ban rather than bill**, and (2) per-user Supabase Realtime
via `postgres_changes` on every logged-in page.

This bundle ships the **Tier 1 quick wins** (the small, self-contained,
low-risk fixes) and confirms one finding was already resolved by the concurrent
ADR 0026 worker rewrite.

## Decisions

- **Stripe `apiVersion` (TPI-4): hard-pin the literal, not `Stripe.LatestApiVersion`.**
  The SDK's config type is `apiVersion?: LatestApiVersion` (the single bundled
  literal), so a hard-pinned `'2026-04-22.dahlia'` _fails typecheck_ on a future
  `pnpm up stripe` until bumped deliberately. That tripwire is the whole point —
  omitting `apiVersion` (the prior state) silently used the account's
  dashboard-default version against SDK-typed code. The literal couples the wire
  version to the types and forces a conscious review on upgrade.
- **Checkout idempotency (TPI-5): key on the pending payment row, not on stable
  inputs.** A key derived from `(user, event, amount)` would _wrongly_ dedupe a
  legitimate repeat tip/ticket within Stripe's 24h window. Keying on the
  freshly-created row id (`tip:<tipId>`, `ticket:<participantId>`,
  `team:<registrationId>`, `roster:<paymentId>`) gives the correct semantic
  "one pending row → at most one Checkout Session" and dedupes the real failure
  (an internal/network retry of the same attempt) without colliding across
  distinct purchases.
- **Sentry server (TPI-12): `tracesSampler` over a flat rate.** Replaced the
  flat `tracesSampleRate: 0.02` with a sampler that returns `0` for
  `/api/notifications/*` cron transactions. Used `name.includes(...)` because
  Next server transactions are named `GET /api/...` (method prefix).
- **Sentry client (TPI-10): 10% → 2%.** Directly the follow-up the worker bundle
  flagged ("left the client rate alone"). Browser pageload transactions are the
  highest-volume span stream, so the client was the dominant cost the
  server/edge trim was meant to cut.
- **TPI-9 (worker throughput ceiling): no change — already resolved by ADR 0026.**
  The worker now drains the whole backlog per wake (loop bounded by
  `DRAIN_BUDGET_MS`) with a debounced DB kick as the primary trigger, so
  `BATCH=50` is a per-claim size, not a per-invocation cap. Re-graded resolved
  rather than applying the now-pointless `BATCH` bump I'd originally suggested.
- **Maps/geocoding vendor (TPI-1/2/3): MapTiler.** Picked one vendor that covers
  _both_ Leaflet tiles and geocoding/autocomplete, collapsing three OSM
  dependencies into one keyed account. Deferred to a later bundle (needs the key
  - the autocomplete provider swap); recorded the direction so the next agent
    doesn't re-litigate it.

## Changes

- `apps/web/src/lib/stripe.ts` — pin `apiVersion: '2026-04-22.dahlia'` (TPI-4).
- `apps/web/src/lib/checkout-session.ts` — optional `idempotencyKey` on the
  destination-charge helper, passed as the `sessions.create` request-options arg
  (TPI-5).
- `apps/web/src/app/events/[id]/{checkout,tip,team-checkout,roster-team-checkout}-actions.ts`
  — each passes its pending-row idempotency key (TPI-5).
- `apps/web/src/lib/email-resend.ts` — optional `idempotencyKey` forwarded as
  the Resend `Idempotency-Key` header (TPI-8).
- `apps/web/src/app/api/notifications/worker/route.ts` — email send passes the
  outbox row id as the idempotency key (TPI-8).
- `apps/web/src/lib/email-resend.test.ts` — **new**, 2 tests pinning the header
  forwarding (present when keyed, absent otherwise).
- `apps/web/instrumentation-client.ts` — client `tracesSampleRate` 0.1 → 0.02
  (TPI-10).
- `apps/web/sentry.server.config.ts` — `tracesSampleRate` → `tracesSampler`
  dropping cron transactions (TPI-12).
- `docs/audits/third-party-integrations.md` — **new** audit; `docs/audits/README.md`
  — index row.

Verify quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(web 83 tests, lint 0 errors, build 8/8).

## Follow-ups (deferred, in priority order)

- **TPI-1 + TPI-3 (P2)** — move address autocomplete + Leaflet tiles off the
  free OSM endpoints to **MapTiler** before traffic scales (they IP-ban, not
  bill). Add an edge `s-maxage` cache on the autocomplete proxy.
- **TPI-7 (P2)** — migrate notification-bell + live-score fan-out from
  `postgres_changes` to Realtime **Broadcast** (its own ADR). The committed
  "notification broadcast spec" looks like the start of this; the bell still
  subscribes via `postgres_changes` as of this entry.
- **TPI-14 (P2)** — reminders cron: batch-insert outbox rows + cap rows per run
  so a 60s timeout can't silently drop the marked-sent tail.
- **TPI-6 / TPI-11 / TPI-13 (P3)** — webhook orphan sweep; lazy-load Sentry
  Replay; PostHog per-request flush batching.
