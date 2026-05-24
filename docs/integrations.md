# Third-party integrations

Every external service the app talks to, with the env vars it needs, where
it's wired in, and how it behaves when unconfigured (most degrade
gracefully so local dev works without secrets).

> **Heads up:** `.env` is gitignored but local copies shadow these. When
> adding a new integration, document it here **and** add the env keys to
> [.env.example](../.env.example) — never paste real secrets into either.

| Service                                       | Purpose                                            | Required for prod?     | Degrades locally?                  |
| --------------------------------------------- | -------------------------------------------------- | ---------------------- | ---------------------------------- |
| [Supabase](#supabase)                         | Postgres, Auth, Realtime, Storage                  | Yes                    | No (local CLI stack)               |
| [Google OAuth](#google-oauth)                 | "Continue with Google" sign-in (via Supabase Auth) | Optional               | Yes (button hides if unconfigured) |
| [Stripe](#stripe)                             | Checkout, Connect payouts, Pro subscriptions       | Paid events / Pro only | Yes (paid UI hides)                |
| [Resend](#resend)                             | Transactional email                                | Yes                    | Yes (log-only)                     |
| [Cloudflare Turnstile](#cloudflare-turnstile) | Bot gate for guest signup                          | Yes                    | Yes (verification skipped)         |
| [Sentry](#sentry)                             | Error monitoring                                   | Recommended            | Yes (no-op SDK)                    |
| [PostHog](#posthog)                           | Product analytics (server-side)                    | Recommended            | Yes (no-op adapter)                |
| [Vercel](#vercel)                             | Hosting, Cron, Analytics, Speed Insights           | Yes                    | N/A                                |
| [Web Push (VAPID)](#web-push-vapid)           | Browser push notifications                         | Optional               | Yes (no push sent)                 |
| [Photon (Komoot)](#photon-komoot)             | Geocoding autocomplete (primary)                   | No (free, no key)      | Works                              |
| [Nominatim (OSM)](#nominatim-osm)             | Geocoding autocomplete (fallback)                  | No (free, no key)      | Works                              |
| [Leaflet + OSM tiles](#leaflet--osm-tiles)    | Map rendering                                      | No (free, no key)      | Works                              |

---

## Supabase

**What it does.** Postgres database, Auth (email/password, OAuth,
anonymous), Realtime channels, and Storage. The source of truth for
everything.

**Env vars.**

| Var                                    | Where used       | Notes                                              |
| -------------------------------------- | ---------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser + server | Project URL                                        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser          | `sb_publishable_…` — safe to expose                |
| `SUPABASE_URL`                         | Server only      | Same URL, kept separate for clarity                |
| `SUPABASE_SECRET_KEY`                  | Server only      | `sb_secret_…` — replaces legacy `service_role` JWT |

These are the new Supabase API keys
([supabase discussion #29260](https://github.com/orgs/supabase/discussions/29260)).
Get them at <https://supabase.com/dashboard/project/_/settings/api-keys/new>.

**Where it's wired in.**

- Browser client: [packages/supabase/src/browser.ts](../packages/supabase/src/browser.ts).
- Server SSR client (honors RLS): [apps/web/src/lib/supabase.ts](../apps/web/src/lib/supabase.ts).
- Admin client (RLS bypass, rare): only inside infrastructure adapters
  that need service-role access.
- Anonymous auth is enabled; check `is_anonymous` on the JWT before
  permitting "real account required" actions.

**Local dev.** Run `pnpm supabase:start` to boot Postgres + Studio at
:54323, then `pnpm db:migrate` and
`pnpm --filter @pickupvb/supabase gen:types`.

**Webhooks.** None inbound. We use Supabase Realtime over WebSockets for
live spot counts (`useEventAttendees` hook).

**Related ADR.** [docs/adr/0002-supabase-auth.md](adr/0002-supabase-auth.md).

---

## Google OAuth

**What it does.** Backs the "Continue with Google" button on `/login`.
Google is the only external IdP wired in today; all other auth flows
(email/password, anonymous, magic link) are handled directly by
Supabase Auth.

**Env vars.**

| Var                              | Where used              | Notes                                         |
| -------------------------------- | ----------------------- | --------------------------------------------- |
| `SUPABASE_AUTH_GOOGLE_CLIENT_ID` | Local Supabase CLI only | OAuth 2.0 Client ID from Google Cloud Console |
| `SUPABASE_AUTH_GOOGLE_SECRET`    | Local Supabase CLI only | Matching client secret                        |

These are **local-only**. The Supabase CLI reads them via
`env(...)` refs in [supabase/config.toml](../supabase/config.toml)
(`[auth.external.google]` block) and the CLI auto-loads
`supabase/.env`. For hosted (staging / prod) the Google provider is
configured in the Supabase dashboard (Auth → Providers → Google), not
from env. Leaving both blank is the right default for any environment
that doesn't run Google auth locally.

**Google Console setup.** Create an OAuth 2.0 Client ID at
<https://console.cloud.google.com/apis/credentials> (type: Web
application) and authorize the Supabase callback URLs:

- `http://127.0.0.1:54321/auth/v1/callback` (local CLI stack)
- `https://<project-ref>.supabase.co/auth/v1/callback` (hosted)

**Where it's wired in.** Provider config in
[supabase/config.toml](../supabase/config.toml); button rendered in
the login page; callback handled by Supabase's `/auth/v1/callback`
endpoint (not a route in this repo) which then hits our
[apps/web/src/app/auth/callback/route.ts](../apps/web/src/app/auth/callback/route.ts)
exchange.

---

## Stripe

**What it does.** Three independent surfaces:

1. **Checkout Sessions** — paid-event RSVPs route money via Stripe
   Connect.
2. **Connect (Express accounts)** — hosts onboard to receive payouts.
3. **Billing subscriptions** — Pro Host monthly/yearly recurring price.

**Env vars.**

| Var                                  | Where used  | Notes                                               |
| ------------------------------------ | ----------- | --------------------------------------------------- |
| `STRIPE_SECRET_KEY`                  | Server only | `sk_test_…` in dev, `sk_live_…` in prod             |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser     | `pk_…`                                              |
| `STRIPE_WEBHOOK_SECRET`              | Server only | `whsec_…` from the webhook endpoint                 |
| `STRIPE_PRO_MONTHLY_PRICE_ID`        | Server only | `price_…` for Pro monthly ($10)                     |
| `STRIPE_PRO_YEARLY_PRICE_ID`         | Server only | `price_…` for Pro yearly ($100)                     |
| `STRIPE_CONNECT_CLIENT_ID`           | Unused      | Only needed for OAuth Connect; we use Express links |

When `STRIPE_SECRET_KEY` is blank, `isStripeConfigured()` returns false
and the paid-event UI hides itself.

**Where it's wired in.**

- Client factory: [apps/web/src/lib/stripe.ts](../apps/web/src/lib/stripe.ts).
- Checkout session creation: [apps/web/src/lib/checkout-session.ts](../apps/web/src/lib/checkout-session.ts).
- Webhook receiver: [apps/web/src/app/api/webhooks/stripe/route.ts](../apps/web/src/app/api/webhooks/stripe/route.ts).
- Connect account mirroring: [apps/web/src/lib/host-stripe-account.ts](../apps/web/src/lib/host-stripe-account.ts).
- Pro subscription helpers: [apps/web/src/lib/pro.ts](../apps/web/src/lib/pro.ts).

**Webhook configuration.** See
[docs/stripe-webhooks.md](stripe-webhooks.md) for the exact event list and
endpoint setup. Connect events use the same endpoint and signing secret
(toggle "Listen to events on Connected accounts" on).

**Local dev.** `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
prints a temporary `whsec_…` — paste into `STRIPE_WEBHOOK_SECRET`.

---

## Resend

**What it does.** Transactional email delivery (RSVP confirmations,
reminders, team invites, broadcasts, etc.). Supabase Auth sends its own
emails via its built-in SMTP — Resend handles everything else.

**Env vars.**

| Var              | Notes                                                              |
| ---------------- | ------------------------------------------------------------------ |
| `RESEND_API_KEY` | `re_…` from <https://resend.com/api-keys>                          |
| `RESEND_FROM`    | e.g. `PickupVB <noreply@pickupvb.com>` — must be a verified domain |

When blank, the worker logs payloads instead of sending. Safe default for
local dev.

**Where it's wired in.** [packages/notifications/src/](../packages/notifications/)
(email/SMS/in-app/push renderers + dispatch) called from
[apps/web/src/app/api/notifications/worker/route.ts](../apps/web/src/app/api/notifications/worker/route.ts).

**Webhooks.** None inbound today. (Resend supports `email.bounced` /
`email.complained` webhooks — wire them up at `/api/webhooks/resend`
when we need bounce handling.)

---

## Cloudflare Turnstile

**What it does.** Invisible bot challenge on guest (anonymous) signup
forms. Anonymous auth opens up an obvious abuse vector; Turnstile is the
gate.

**Env vars.**

| Var                              | Where used  | Notes              |
| -------------------------------- | ----------- | ------------------ |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Browser     | Widget render key  |
| `TURNSTILE_SECRET_KEY`           | Server only | Token verification |

Provision both at <https://dash.cloudflare.com/?to=/:account/turnstile>.
When the secret is unset, server-side verification is skipped (with a
log warning) so local dev works.

**Where it's wired in.**

- Widget: [apps/web/src/components/turnstile-widget.tsx](../apps/web/src/components/turnstile-widget.tsx).
- Verifier: [apps/web/src/lib/turnstile.ts](../apps/web/src/lib/turnstile.ts).
- Consumed by guest signup: [apps/web/src/app/events/[id]/guest-actions.ts](../apps/web/src/app/events/%5Bid%5D/guest-actions.ts).

---

## Sentry

**What it does.** Error monitoring on the Next.js client + server. Source
maps uploaded at build time.

**Env vars.**

| Var                      | Where used    | Notes                                |
| ------------------------ | ------------- | ------------------------------------ |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser       | DSN is public, not a secret          |
| `SENTRY_ORG`             | CI/build only | Org slug                             |
| `SENTRY_PROJECT`         | CI/build only | Defaults to `pickupvb-web`           |
| `SENTRY_AUTH_TOKEN`      | CI/build only | Org auth token for source-map upload |

DSN blank = SDK no-ops. Auth token only needed in CI (Vercel build env);
local builds skip source-map upload.

**Where it's wired in.** SDK install lives in
`sentry.client.config.ts` / `sentry.server.config.ts` /
`sentry.edge.config.ts` (root of `apps/web/`). Test harness at
[apps/web/src/app/sentry-test/](../apps/web/src/app/sentry-test/).

---

## PostHog

**What it does.** First-party product analytics. Currently **server-side
only** — `posthog-node` captures business events (`event_published`,
`event_joined`, …) from server actions. The browser SDK (`posthog-js`)
is not yet wired in; blocked on a consent banner (audit P2 #5).

**Env vars.**

| Var                        | Where used  | Notes                                                                                                             |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `POSTHOG_API_KEY`          | Server only | Project API key (`phc_…`) — write-only, safe on the server                                                        |
| `POSTHOG_DISTINCT_ID_SALT` | Server only | Secret salt used to sha256-hash Supabase user ids before they leave the box. Generate with `openssl rand -hex 32` |
| `POSTHOG_HOST`             | Server only | Optional. Defaults to `https://us.i.posthog.com`. Use `https://eu.i.posthog.com` for EU projects                  |

When `POSTHOG_API_KEY` or `POSTHOG_DISTINCT_ID_SALT` is missing,
`analyticsFromEnv()` returns `NoopAnalytics` — no network calls, no
console noise. **Recommended posture: enabled in Production only;
leave blank in Preview, dev, and local.**

**Where it's wired in.**

- Port: [packages/domain/src/shared/analytics-port.ts](../packages/domain/src/shared/analytics-port.ts).
- Adapters:
  [noop-analytics.ts](../packages/infrastructure/src/noop-analytics.ts)
  and
  [posthog-analytics.ts](../packages/infrastructure/src/posthog-analytics.ts)
  (the latter exports `analyticsFromEnv()`).
- Composition root: `analytics` export in
  [apps/web/src/lib/handlers.ts](../apps/web/src/lib/handlers.ts).
- Capture sites today:
  [events/new/actions.ts](../apps/web/src/app/events/new/actions.ts)
  (`event_published`) and
  [events/[id]/rsvp-actions.ts](../apps/web/src/app/events/%5Bid%5D/rsvp-actions.ts)
  (`event_joined`).

**Privacy.** Distinct ids are sha256-hashed with
`POSTHOG_DISTINCT_ID_SALT` so the raw Supabase id never crosses the
network. Traits are an allowlist (`metroId`, `skillTier`,
`accountAgeDays`, `isAnonymous`) — no email, no display name.
Rotating the salt re-anonymizes every existing actor (intentional).

**Webhooks.** None inbound.

**Setup runbook.** Step-by-step in
[docs/analytics-setup.md](analytics-setup.md). Audit and roadmap in
[docs/audits/analytics.md](audits/analytics.md).

---

## Vercel

**What it does.** Production hosting for the Next.js app, scheduled
crons that drive the notification worker, plus first-party Analytics and
Speed Insights.

**Env vars.**

| Var                   | Notes                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET`         | Random hex. Vercel sends it as `Authorization: Bearer <secret>`; cron routes reject calls without it. Generate with `openssl rand -hex 32`. |
| `NEXT_PUBLIC_APP_URL` | Public site origin used by templates to build CTA URLs                                                                                      |

**Cron schedule.** Defined in
[apps/web/vercel.json](../apps/web/vercel.json):

| Path                           | Schedule     | What                                                 |
| ------------------------------ | ------------ | ---------------------------------------------------- |
| `/api/notifications/worker`    | every minute | Flushes queued notifications (email/SMS/push/in-app) |
| `/api/notifications/reminders` | every 15 min | Generates 24h / 2h reminder notifications            |

**Analytics.** Product analytics is handled by PostHog
(server-side via `posthog-node`) — see
[docs/monitoring.md](monitoring.md#product-analytics-posthog).
Vercel Analytics and Speed Insights were retired pre-launch (audit
P3 #12, Bundle 82).

**Auto-deploy.** Every push to `main` triggers a production build.
Migrations are picked up automatically — see [AGENTS.md](../AGENTS.md).

---

## Web Push (VAPID)

**What it does.** Browser push notifications via the standard Web Push
protocol. No third-party vendor — the browser's push service (FCM/APNs)
does delivery, signed by our VAPID keys.

**Env vars.**

| Var                            | Where used  | Notes                                  |
| ------------------------------ | ----------- | -------------------------------------- |
| `VAPID_PUBLIC_KEY`             | Server only | Public half of the keypair             |
| `VAPID_PRIVATE_KEY`            | Server only | **Secret** — signs push payloads       |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser     | Same public key, exposed for subscribe |
| `VAPID_SUBJECT`                | Server only | `mailto:ops@pickupvb.com`              |

Generate a keypair once:

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Re-keying invalidates every existing push subscription, so don't rotate
casually.

**Where it's wired in.** Adapter at
[apps/web/src/lib/web-push.ts](../apps/web/src/lib/web-push.ts);
storage migration in
[supabase/migrations/20260527000000_push_subscriptions.sql](../supabase/migrations/20260527000000_push_subscriptions.sql).
Dispatched from the notification worker.

When VAPID env vars are unset the adapter throws on first use; the
worker treats push as best-effort and won't block other channels.

---

## Photon (Komoot)

**What it does.** Primary typeahead geocoder for venue / city
autocomplete. Free, no API key, OSM-based, typeahead-optimized.

**Env vars.** None — public anonymous API.

**Where it's wired in.**
[apps/web/src/app/api/geocode/autocomplete/route.ts](../apps/web/src/app/api/geocode/autocomplete/route.ts).
Falls back to Nominatim on error.

**Caveats.** Public instance is rate-limited. If volume grows, self-host
Photon (Docker image) and point `PHOTON_URL` at it — currently
hard-coded.

---

## Nominatim (OSM)

**What it does.** Fallback geocoder when Photon errors or returns
nothing. Same OSM data but not typeahead-optimized — used for
robustness.

**Env vars.** None — public anonymous API.

**Where it's wired in.** Same file as Photon
([apps/web/src/app/api/geocode/autocomplete/route.ts](../apps/web/src/app/api/geocode/autocomplete/route.ts)).

**Caveats.** OSM's public Nominatim has a 1 req/sec limit and asks for
a meaningful `User-Agent`. If production traffic increases, self-host
or move to a paid provider (Mapbox / Geoapify / OpenCage).

---

## Leaflet + OSM tiles

**What it does.** Map rendering on event detail pages.

**Env vars.** None.

**Where it's wired in.**
[apps/web/src/components/event-map.tsx](../apps/web/src/components/event-map.tsx).
Uses `react-leaflet` + the default OpenStreetMap tile server.

**External assets.** Leaflet's default marker icons are pulled from
`unpkg.com/leaflet@1.9.4/dist/images/…`. If we ever block third-party
asset CDNs via CSP, mirror those PNGs into `/public` and switch the
`L.Icon.Default` URLs.

**Caveats.** The OSM tile server has a usage policy
(<https://operations.osmfoundation.org/policies/tiles/>). For meaningful
traffic, switch to a hosted tile provider (MapTiler, Stadia Maps,
CloudFlare's tile mirror) and set the appropriate `attribution` prop.

---

## Adding a new integration

1. Add env keys (placeholder values) to
   [.env.example](../.env.example) with a comment explaining where to
   get the credentials.
2. Wrap the SDK in a thin module under `apps/web/src/lib/` that
   degrades gracefully when env is missing (return early, log warn).
3. If the integration is called from the domain or application layer,
   put it behind a port (interface) in `packages/domain` and an adapter
   in `packages/infrastructure` — never import an SDK directly from
   those packages.
4. Document it in this file (one section per service, following the
   template above).
5. If it has webhooks: create a dedicated route under `apps/web/src/app/api/webhooks/<service>/route.ts`, dedupe events via a `<service>_webhook_events` table, and add a section to the webhook docs.
