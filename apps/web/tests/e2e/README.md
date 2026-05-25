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
- `DEV_TEST_USER_EMAIL` / `DEV_TEST_USER_PASSWORD` — primary test account
  (`zacharyjordan82+attendee-a@gmail.com`). Never use a prod account.
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
# Interactive UI mode — pick tests, watch traces, step through failures
PLAYWRIGHT_BASE_URL=https://dev.pickupvb.com \
  TEST_USER_EMAIL=zacharyjordan82+attendee-a@gmail.com \
  TEST_USER_PASSWORD=Test123! \
  TEST_ATTENDEE_B_EMAIL=zacharyjordan82+attendee-b@gmail.com \
  TEST_FREE_HOST_EMAIL=zacharyjordan82+free-host@gmail.com \
  TEST_PRO_HOST_EMAIL=zacharyjordan82+pro-host@gmail.com \
  TEST_STRIPE_HOST_EMAIL=zacharyjordan82+stripe-host@gmail.com \
  TEST_ADMIN_EMAIL=zacharyjordan82+admin@gmail.com \
  pnpm --filter @pickupvb/web e2e:ui

# Public smoke only (no auth required)
pnpm --filter @pickupvb/web e2e:public

# Against a deployed dev URL (env vars in .env.local are auto-loaded)
PLAYWRIGHT_BASE_URL=https://dev.pickupvb.com pnpm --filter @pickupvb/web e2e:public

# Full suite including authenticated specs (reads from apps/web/.env.local)
pnpm --filter @pickupvb/web e2e

# Exclude destructive tests (group/team creation that can't be cleaned up)
pnpm --filter @pickupvb/web e2e -- --grep-invert @destructive
```

Test accounts are pre-seeded in the dev Supabase project. All share `TEST_USER_PASSWORD`:

| Env var                  | Email                                   | Role           |
| ------------------------ | --------------------------------------- | -------------- |
| `TEST_USER_EMAIL`        | `zacharyjordan82+attendee-a@gmail.com`  | Attendee A     |
| `TEST_ATTENDEE_B_EMAIL`  | `zacharyjordan82+attendee-b@gmail.com`  | Attendee B     |
| `TEST_FREE_HOST_EMAIL`   | `zacharyjordan82+free-host@gmail.com`   | Free host      |
| `TEST_PRO_HOST_EMAIL`    | `zacharyjordan82+pro-host@gmail.com`    | Pro host       |
| `TEST_STRIPE_HOST_EMAIL` | `zacharyjordan82+stripe-host@gmail.com` | Stripe host    |
| `TEST_ADMIN_EMAIL`       | `zacharyjordan82+admin@gmail.com`       | Platform admin |

## Layout

- `smoke.public.spec.ts` — anonymous baseline: home, events list/filter, login form, sitemap, 404, protected redirect.
- `auth.public.spec.ts` — auth form edge cases: sign-up toggle, wrong-password error, forgot-password, `?next=` redirect.
- `navigation.public.spec.ts` — public route reachability (pricing, community, groups, players), auth guards, external interstitial.
- `players.public.spec.ts` — player directory search and public profile load.
- `groups.public.spec.ts` — group directory search and public group profile load.
- `accessibility.public.spec.ts` — mobile viewport layout, keyboard focus, theme toggle.
- `auth.setup.ts` — one-time sign-in that caches the session under
  `apps/web/.playwright/.auth/user.json`. Required by authed specs.
- `profile.authed.spec.ts` — profile page, billing checklist, host event entry, sign out.
- `profile-edit.authed.spec.ts` — edit display name / home city / Instagram handle with before/after restore; handle editor; notification preference toggle; receipts/billing/analytics/pro pages.
- `events.authed.spec.ts` — `/events/new` form, template name validation (Pro guard), RSVP join/leave.
- `event-create-extended.authed.spec.ts` — external registration toggle (section 3.4), full template save/apply/remove flow for Pro users (section 3.5).
- `event-attendance.authed.spec.ts` — position RSVP and position roster visibility (section 5.2); fixmes for paid RSVP, capacity, tip jar (sections 5.3–5.6).
- `event-host.authed.spec.ts` — creates a real test event in `beforeAll`, verifies host flows (detail, edit, title change, host section, attendance panel, cancel panel), cancels in `afterAll`.
- `groups.authed.spec.ts` — follow/unfollow a group. Group creation tagged `@destructive`.
- `groups-manage.authed.spec.ts` — group edit page load and description edit (section 7.2), hero image upload/remove on group (section 7.3); fixmes for members and host-as-group (sections 7.4, 7.6).
- `hero-image.authed.spec.ts` — hero image upload widget presence and upload/remove on profile, event edit, and group edit (sections 2.3, 4.2, 7.3).
- `community.authed.spec.ts` — community directory, create+delete listing (self-contained), /leaving interstitial.
- `player-social.authed.spec.ts` — own public profile, directory search, follow/unfollow non-self player, /friends page.
- `tournament.authed.spec.ts` — tournament event page load and bracket page load; fixmes for all interactive tournament flows (section 6).
- `teams.authed.spec.ts` — /teams/new form load and @destructive team creation (section 8.1); fixmes for invites, remove, broadcast (sections 8.2–8.4).
- `billing-stripe.authed.spec.ts` — pricing, /profile/billing/pro, /profile/billing, /profile/billing/analytics page loads; fixmes for Stripe Checkout and Connect flows (sections 11–12).
- `notifications.authed.spec.ts` — notification bell presence, bell click opens panel, /notifications page load; fixmes for unread badge and email notifications (section 13).
- `authorization.authed.spec.ts` — non-owner redirected from event edit, non-member redirected from group members, non-Pro analytics guard (section 18.2).
- `admin.authed.spec.ts` — all fixme; requires an admin-role account (section 17).
- `regression.authed.spec.ts` — smoke regression checklist after any deploy (section 19).

### Placeholder tests (`test.fixme`)

Tests that need Stripe, multi-user scenarios, or complex UI interactions (date picker, geocoding) are marked `test.fixme`. They appear in the source as documentation of intended coverage but are skipped at runtime. Graduate a `test.fixme` to a full test as the blocking dependency is resolved.

The cached session and any HTML report / trace artifacts are gitignored at the
repo root.

## Test user

Create a dedicated account in your dev/preview Supabase project (never reuse a
production user). The setup project signs in via the standard
`/login` form, so the user only needs an email + password — no special role.

For authenticated tests that mutate data (RSVP, host event), use a user whose
data is safe to churn — and follow the hygiene rules above.
