# PostHog setup

First-party product analytics for pickupvb. Shipped in Bundle 75
(see [docs/audits/analytics.md](audits/analytics.md) and
[docs/journal/2026-05-24-bundle-75.md](journal/2026-05-24-bundle-75.md)).

The adapter is hexagonal: domain owns the
[AnalyticsPort](../packages/domain/src/shared/analytics-port.ts), and
infrastructure provides two implementations —
[NoopAnalytics](../packages/infrastructure/src/noop-analytics.ts) (default
when env vars are missing) and
[PostHogAnalytics](../packages/infrastructure/src/posthog-analytics.ts)
(server-side `posthog-node` SDK). The composition root resolves which
one to use at boot via `analyticsFromEnv()` in
[apps/web/src/lib/handlers.ts](../apps/web/src/lib/handlers.ts).

## 1. Create the PostHog project

1. Sign up at https://us.posthog.com/signup (or https://eu.posthog.com
   for EU residency).
2. Pick **Product analytics** as the primary use case. Replay / Flags
   can be enabled later from the same project.
3. Create one project per environment:
   - `pickupvb-prod` — backs production captures.
   - `pickupvb-dev` — optional; backs `dev.pickupvb.com` if you want
     to dogfood without polluting prod numbers. Skip if you'd rather
     leave dev silent (see §4).

## 2. Grab the project API key

Project → **Settings** → **Project** → **Project API key**. The key
starts with `phc_…`. This is the write-only key — safe on the server,
never exposed to the browser. (The Personal API key under your account
is different and grants full read/write; don't use it here.)

## 3. Generate a distinct-id salt

```bash
openssl rand -hex 32
```

You'll use this as `POSTHOG_DISTINCT_ID_SALT`. The adapter sha256-hashes
`salt + ':' + supabaseUserId` before each `identify` / `capture`, so
PostHog never sees the raw Supabase id. Treat the salt like a password:
1Password / secrets manager, not git. Rotating it re-anonymizes every
existing actor (intentional — see audit P3 #10).

## 4. Set Vercel env vars

### Production project (`pickupvb.com`)

```bash
vercel env add POSTHOG_API_KEY production
vercel env add POSTHOG_DISTINCT_ID_SALT production
# Optional — only set if you picked the EU PostHog region
vercel env add POSTHOG_HOST production   # value: https://eu.i.posthog.com
```

Then redeploy production: `vercel --prod`.

### Dev project (`dev.pickupvb.com`)

You have two options. **Pick one.**

- **Leave PostHog disabled in dev (recommended).** Don't set
  `POSTHOG_API_KEY` or `POSTHOG_DISTINCT_ID_SALT` in the dev Vercel
  project. `analyticsFromEnv()` returns `NoopAnalytics`, which is a
  silent drop. No outbound requests, no console noise, no funnel
  pollution. This is the path that requires zero code changes.
- **Capture into a separate dev project.** Create `pickupvb-dev` in
  PostHog with its own `phc_…` key and salt, then set the env vars on
  the dev Vercel project the same way as production. Useful if you
  want to A/B the analytics integration itself before promoting to
  prod.

**Never share a project key between prod and dev.** Once distinct ids
mix, segmenting by environment after the fact is painful.

### Preview deployments

Leave the env vars unset in **Preview** scope. PR previews then run
the noop adapter, which is what you want — preview traffic is bots,
agents, and dev sessions, and would skew funnels.

### Local (`.env.local`)

Already gitignored. Same rule as dev: leave blank unless you
explicitly want localhost traffic in PostHog. If you do, point at
`pickupvb-dev`, never prod.

```bash
POSTHOG_API_KEY=phc_your_dev_key
POSTHOG_DISTINCT_ID_SALT=any-random-string-for-dev
# POSTHOG_HOST=https://eu.i.posthog.com
```

## 5. Verify capture end-to-end

1. Deploy to production.
2. Sign in, create a test event, then join it (or have a second
   account join).
3. In PostHog: **Activity** → **Live events**. You should see
   `event_published` followed by `event_joined` within a few seconds.
4. Each event should have:
   - `distinct_id` = a 64-char hex string (the sha256 hash). **Never**
     a raw UUID — if you see one, the salt env var didn't load.
   - `properties.eventId`, `hostId`, `eventType`, `byPosition`,
     `priceCents`, `metroId` (plus `capacity` on `event_published`,
     `waitlist` + `position` on `event_joined`).

If nothing arrives:

- Check `vercel env ls production` shows both vars.
- Check the Vercel runtime logs for `[posthog]` warnings (the
  adapter logs at `console.warn` on failure and never throws).
- Confirm the deployed build is post-Bundle 75 (the export
  `analytics` should exist in `apps/web/src/lib/handlers.ts`).

## 6. Content Security Policy

**No CSP changes are required for Bundle 75.**

The current adapter uses the **server-side** `posthog-node` SDK. CSP only
applies to requests initiated by the browser; server → PostHog ingest
traffic bypasses it entirely. The existing `connect-src` allowlist in
[apps/web/next.config.mjs](../apps/web/next.config.mjs) (Supabase,
Cloudflare Turnstile, Vercel Live) is unchanged.

**CSP changes will be required** when we add the browser SDK
(`posthog-js`) — blocked on the consent banner (audit P2 #5). When
that lands, the policy needs to add the PostHog hosts:

| Directive     | Add (US region)                                            | Add (EU region)                                            |
| ------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `script-src`  | `https://us-assets.i.posthog.com`                          | `https://eu-assets.i.posthog.com`                          |
| `connect-src` | `https://us.i.posthog.com https://us-assets.i.posthog.com` | `https://eu.i.posthog.com https://eu-assets.i.posthog.com` |
| `img-src`     | `https://us.i.posthog.com`                                 | `https://eu.i.posthog.com`                                 |
| `worker-src`  | already allows `blob:` (no change)                         | already allows `blob:` (no change)                         |

If you later enable Session Replay, the same hosts cover it — no
additional directives needed. Don't add these preemptively; only widen
the policy when the browser SDK actually ships.

## 7. First dashboards to build

Once captures are flowing, create these in PostHog → **Dashboards** →
**New** → **pickupvb · north-star metrics**:

- **Publish → Join funnel.** Funnels: `event_published` →
  `event_joined`, breakdown by `metroId`. Surfaces metros with demand
  vs. supply imbalance.
- **Weekly active hosts.** Trends: unique users firing
  `event_published`, weekly, breakdown by `eventType`. The marketable
  `host_activity_monthly` number for sponsor pitches (audit P2 #7).
- **Position demand.** Trends: count of `event_joined` where
  `byPosition = true`, breakdown by `position`. Drives the
  `position_demand_weekly` SQL view.

## 8. What's deliberately off (for now)

- **Session Replay** — needs browser SDK + consent banner. Project
  Settings → Recordings = off.
- **Autocapture** — same prerequisite.
- **Feature Flags** — fine to enable, but no flag-gated code exists
  yet. Wait until audit P3 #11.

## 9. Rotation runbook

Yearly (or after any suspected compromise):

1. `openssl rand -hex 32` → new salt.
2. `vercel env rm POSTHOG_DISTINCT_ID_SALT production && vercel env add POSTHOG_DISTINCT_ID_SALT production`.
3. Redeploy.

Existing PostHog actors orphan (intentional — that's the point of
rotation). New captures land under fresh hashed ids. Log the rotation
date in the audit's remediation log.
