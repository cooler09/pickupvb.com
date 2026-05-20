# Playwright e2e tests

End-to-end tests for `apps/web`. Built for the **dev environment** — either a
local `pnpm dev` server or a deployed Vercel preview / dev URL — and a
read-only public smoke pass against **production**.

## CI triggers

| Workflow                                                           | Trigger                                                                  | Scope                         | Target                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------- |
| [`smoke-prod.yml`](../../../../.github/workflows/smoke-prod.yml)   | Vercel Production `deployment_status: success` (+ manual)                | Public smoke only (read-only) | URL from deploy payload → `PROD_BASE_URL` fallback |
| [`e2e-develop.yml`](../../../../.github/workflows/e2e-develop.yml) | Vercel Preview `deployment_status: success` for `develop` ref (+ manual) | Full suite (public + authed)  | URL from deploy payload → `DEV_BASE_URL` fallback  |
| [`e2e.yml`](../../../../.github/workflows/e2e.yml)                 | manual only                                                              | Choose scope via input        | Arbitrary URL input                                |

The `deployment_status` triggers fire **after** Vercel finishes deploying, so
tests always hit a live URL — no race against the build. The target URL is
read straight from `github.event.deployment_status.target_url`.

Required secrets (Settings → Secrets and variables → Actions):

- `PROD_BASE_URL` — fallback production origin (used only for manual runs)
- `DEV_BASE_URL` — fallback dev origin (used only for manual runs)
- `DEV_TEST_USER_EMAIL` / `DEV_TEST_USER_PASSWORD` — credentials for a
  pre-seeded user that exists **only in the dev environment**. Never use a
  prod account.
- `VERCEL_AUTOMATION_BYPASS_SECRET` — _required if Vercel Deployment
  Protection is enabled._ Generate it under Vercel project Settings →
  Deployment Protection → "Protection Bypass for Automation". Without it,
  Playwright sees the Vercel SSO page instead of the app on protected
  previews. The config sends it as `x-vercel-protection-bypass` on every
  request.

## Dev-environment hygiene

The suite is designed to leave **no residual data** in the target environment:

1. **All public specs** (`*.public.spec.ts`) are GET-only — no form
   submissions, no API mutations.
2. **All authed specs** (`*.authed.spec.ts`) are currently read-only too —
   they navigate pages, assert UI state, and the final test signs the user out
   (no DB side effect beyond a session revoke).
3. **New specs that mutate data must clean up after themselves.** Use
   Playwright's `test.afterEach` / `test.afterAll` to delete anything the test
   created (RSVPs, draft events, group invites). Prefer a single authoritative
   teardown over relying on the next run to overwrite.
4. **Never run against `PROD_BASE_URL` with auth.** The prod smoke workflow
   intentionally does not pass auth secrets, so any accidental authed test
   would fail the setup step rather than mutate production data.

If you need to add a write test that genuinely can't clean up (e.g. exercises
an irreversible flow), gate it with a tag and exclude it from the standard
runs:

```ts
test('webhook fires once', { tag: '@destructive' }, async ({ page }) => {
  /* ... */
});
```

Then run with `--grep-invert @destructive` in the standard workflows.

## Telemetry filtering

E2e traffic is suppressed at ingest so it doesn't pollute Sentry or Vercel
Analytics dashboards:

- **Server / edge requests** carry the `x-pickupvb-e2e: 1` header (set in
  [playwright.config.ts](../../playwright.config.ts) via `use.extraHTTPHeaders`).
  The Sentry server and edge `beforeSend` hooks drop any event whose request
  carries that header — see [sentry.server.config.ts](../../sentry.server.config.ts)
  and [sentry.edge.config.ts](../../sentry.edge.config.ts).
- **Browser events** are filtered by `navigator.webdriver`, which Playwright
  (and any other WebDriver/CDP client) sets to `true` automatically. This
  covers both the Sentry browser SDK ([instrumentation-client.ts](../../instrumentation-client.ts))
  and Vercel Analytics ([analytics-client.tsx](../../src/components/analytics-client.tsx)).

The net effect: a green or red e2e run leaves zero noise in production
telemetry, and bot traffic gets dropped for free.

## Run locally

```bash
# Local dev (auto-starts pnpm dev if not already running)
pnpm --filter @pickupvb/web e2e

# Public smoke only (no auth required)
pnpm --filter @pickupvb/web e2e:public

# Against a deployed preview / dev URL
PLAYWRIGHT_BASE_URL=https://dev.pickupvb.com pnpm --filter @pickupvb/web e2e:public

# Authenticated specs — requires a seeded test user
TEST_USER_EMAIL=tester@example.com \
TEST_USER_PASSWORD=… \
pnpm --filter @pickupvb/web e2e
```

## Layout

- `*.public.spec.ts` — anonymous, read-only smoke (home, events, login,
  sitemap, 404).
- `auth.setup.ts` — one-time sign-in that caches the session under
  `apps/web/.playwright/.auth/user.json`. Required by authed specs.
- `*.authed.spec.ts` — runs with the cached session (profile, billing
  checklist, host-event entry, sign out).

The cached session and any HTML report / trace artifacts are gitignored at the
repo root.

## Test user

Create a dedicated account in your dev/preview Supabase project (never reuse a
production user). The setup project signs in via the standard
`/login` form, so the user only needs an email + password — no special role.

For authenticated tests that mutate data (RSVP, host event), use a user whose
data is safe to churn — and follow the hygiene rules above.
