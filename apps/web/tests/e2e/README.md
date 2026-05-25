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

### Unblocking skipped tests

Most skips on dev are intentional — the test couldn't find required fixture
state. Grouped by what would need to change to make them run, with the
playbook for each:

#### 1. `SUPABASE_LOCAL_SIGNOUT_DEPLOYED=1` — sign-out tests

- **Files:** [profile.authed.spec.ts:52](../../../tests/e2e/profile.authed.spec.ts), [regression.authed.spec.ts:203](../../../tests/e2e/regression.authed.spec.ts).
- **Blocker:** the test signs out via `signOut({ scope: 'local' })`, which
  was added to `components/actions.ts` but has not been redeployed to
  preview/dev yet.
- **Unblock:** redeploy `apps/web` to the dev environment, then export
  `SUPABASE_LOCAL_SIGNOUT_DEPLOYED=1` in the test env (or add it to
  `apps/web/.env.local` alongside the other `TEST_*` vars).

#### 2. Stripe Checkout / Connect / webhook-driven tests

- **Files:** [event-attendance.authed.spec.ts:116-126,308](../../../tests/e2e/event-attendance.authed.spec.ts),
  [event-create-extended.authed.spec.ts:303-309](../../../tests/e2e/event-create-extended.authed.spec.ts),
  [events.authed.spec.ts:24,114](../../../tests/e2e/events.authed.spec.ts),
  [billing-stripe.authed.spec.ts](../../../tests/e2e/billing-stripe.authed.spec.ts) (paid-event/Connect fixmes).
- **Blocker:** require driving Stripe Checkout (test card flow,
  `4000 0000 0000 0002` decline card, abandon, refund window), Connect
  onboarding, or `customer.subscription.*` webhook delivery — none of
  which Playwright can do unaided.
- **Unblock:** stand up a Stripe test-mode fixture suite. Minimum pieces:
  - A `stripe-host` account that has completed Stripe Connect onboarding
    (`TEST_STRIPE_HOST_EMAIL` already wired in
    [auth.stripe-host.setup.ts](../../../tests/e2e/auth.stripe-host.setup.ts)).
  - Helpers that fill the Stripe-hosted Checkout iframe (Playwright can
    drive `https://checkout.stripe.com/...` once the iframe URL is captured
    from the redirect). See Stripe's Playwright cookbook for selectors.
  - For webhook-driven assertions, forward Stripe events to dev via
    `stripe listen --forward-to https://dev.pickupvb.com/api/stripe/webhook`
    while the test runs, then poll the DB row that the webhook mutates.
  - Refund window flows additionally need an event-creation helper that
    sets `refund_window_hours` to a known value.

#### 3. Email-inbox-dependent tests

- **Files:** [auth-extended.public.spec.ts:126-130](../../../tests/e2e/auth-extended.public.spec.ts)
  (email confirmation flow), [notifications.authed.spec.ts](../../../tests/e2e/notifications.authed.spec.ts)
  (email notification fixmes), team-broadcast email delivery hooks.
- **Blocker:** asserting that a real email was sent and clickable.
- **Unblock:** provision a Mailtrap / Mailosaur sandbox and route Resend
  output to it for the test environment. Add an env var
  (`TEST_INBOX_API_TOKEN`) and a helper that polls the sandbox API for a
  message matching `to:` and a subject regex, then extracts the
  confirmation/notification link. Reference: the existing
  `RESEND_FROM_EMAIL` config in [docs/integrations.md](../../../../../docs/integrations.md).

#### 4. Tournament / divisions / brackets

- **Files:** all of [tournament.authed.spec.ts:74-120](../../../tests/e2e/tournament.authed.spec.ts),
  plus [events.authed.spec.ts:26](../../../tests/e2e/events.authed.spec.ts)
  (multi-division creation).
- **Blocker:** dev currently has no seeded tournament event with divisions,
  registrations, and bracket state. Most of these tests need a multi-stage
  fixture (event → divisions → captains → rosters → seeded matches).
- **Unblock:** apply [supabase/snippets/seed-tournament-fixture.sql](../../../../../supabase/snippets/seed-tournament-fixture.sql)
  against the target DB. It is idempotent and creates two published
  tournaments hosted by `TEST_FREE_HOST_EMAIL` — `[E2E] Ad-Hoc Tournament Fixture`
  (short code `E2ETFA`, 2 divisions, no pre-registered teams; use for
  ad-hoc captain-builds-a-team flows) and `[E2E] Roster Tournament Fixture`
  (short code `E2ETFR`, 2 divisions × 2 persistent teams each captained
  by attendee-a / attendee-b / free-host / pro-host, plus a
  single-elimination bracket with seeded round-1 matches). Apply with
  `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/snippets/seed-tournament-fixture.sql`
  locally, or against dev/preview with `psql "$SUPABASE_DB_URL" -f ...`.
  Tests can then address the events by short code (`/e/E2ETFA`, `/e/E2ETFR`)
  or look them up by the `[E2E]` title prefix.

#### 5. Pro-only template / sponsor / analytics flows

- **Files:** [events.authed.spec.ts:37,57](../../../tests/e2e/events.authed.spec.ts),
  [event-create-extended.authed.spec.ts:231](../../../tests/e2e/event-create-extended.authed.spec.ts),
  [event-host.authed.spec.ts:270](../../../tests/e2e/event-host.authed.spec.ts)
  (sponsor panel fixme), [regression.authed.spec.ts:118](../../../tests/e2e/regression.authed.spec.ts).
- **Blocker:** the default test user (attendee-a) is not Pro. The suite
  already has a `pro-host` storage state
  ([auth.pro-host.setup.ts](../../../tests/e2e/auth.pro-host.setup.ts))
  driven by `TEST_PRO_HOST_EMAIL`, but most of these specs run with the
  shared `[authed]` project and never switch.
- **Unblock:** either (a) add a `[authed-pro]` Playwright project in
  [playwright.config.ts](../../../playwright.config.ts) that loads
  `pro-host.json` storage state, and move the Pro-gated tests there, or
  (b) within each test do
  `await page.context().addCookies(...)` after loading the pro-host state
  manually. Option (a) is cleaner — the existing `setup-pro-host`
  dependency already produces the state file.

#### 6. Multi-actor admin / claim-approval flows

- **Files:** [admin.authed.spec.ts](../../../tests/e2e/admin.authed.spec.ts)
  (claim approval, role escalation), [community.authed.spec.ts:127](../../../tests/e2e/community.authed.spec.ts)
  (rate-limit fixme).
- **Blocker:** claim approval needs a city+day-matched listing and event
  spanning attendee-a, attendee-b, and admin so the admin has something
  to approve. Rate-limit needs an account willing to be locked out for
  24h after the test runs.
- **Unblock:** add a dedicated `TEST_RATELIMIT_EMAIL` account that the CI
  pipeline doesn't reuse for any other test (so a 24h lockout is
  acceptable). For claim approval, extend
  [supabase/seed.sql](../../../../../supabase/seed.sql) with a paired
  listing + event row keyed to attendee-b's home city, then write the
  test to drive `/admin/claims` as the admin account.

#### 7. Owned-fixture skips (no infra blocker)

These skip because the test user happens not to own / be on / be hosting
the required resource on the target environment. They are skip-graceful
by design — running the matching `@destructive` create test once, or
hand-creating the row in dev, unblocks them on the next run.

- **No groups in this environment** / **Test user does not own a group**
  ([groups.authed.spec.ts](../../../tests/e2e/groups.authed.spec.ts),
  [groups-manage.authed.spec.ts](../../../tests/e2e/groups-manage.authed.spec.ts),
  [hero-image.authed.spec.ts](../../../tests/e2e/hero-image.authed.spec.ts)):
  run the `@destructive` group-creation test as attendee-a, or create
  a group manually via the UI.
- **No captained team found** ([teams.authed.spec.ts](../../../tests/e2e/teams.authed.spec.ts)):
  run the `@destructive` team-creation test as attendee-a (requires Pro,
  see §5).
- **No events / no joinable event** ([events.authed.spec.ts](../../../tests/e2e/events.authed.spec.ts),
  [regression.authed.spec.ts](../../../tests/e2e/regression.authed.spec.ts)):
  run `event-host.authed.spec.ts`'s `beforeAll` (publishes a test event)
  or create one via `/events/new`.
- **No players / no community listings**: run the relevant `@destructive`
  test once, or seed via [supabase/seed.sql](../../../../../supabase/seed.sql).
- **No theme toggle / no surface filter / `/leaving` not in this build**
  ([accessibility.public.spec.ts](../../../tests/e2e/accessibility.public.spec.ts),
  [smoke.public.spec.ts](../../../tests/e2e/smoke.public.spec.ts),
  [navigation.public.spec.ts](../../../tests/e2e/navigation.public.spec.ts)):
  these probe optional UI affordances; skip is correct when they're not
  rendered, no action needed unless the affordance is supposed to be
  there.

#### 8. `TEST_ATTENDEE_B_EMAIL` not set

- **Files:** invite/accept/decline/broadcast paths in
  [teams.authed.spec.ts](../../../tests/e2e/teams.authed.spec.ts),
  [groups.authed.spec.ts](../../../tests/e2e/groups.authed.spec.ts),
  [groups-manage.authed.spec.ts](../../../tests/e2e/groups-manage.authed.spec.ts),
  [community.authed.spec.ts](../../../tests/e2e/community.authed.spec.ts),
  [player-social.authed.spec.ts](../../../tests/e2e/player-social.authed.spec.ts),
  [event-attendance.authed.spec.ts](../../../tests/e2e/event-attendance.authed.spec.ts).
- **Blocker:** the second test account is not provisioned for the runner.
- **Unblock:** export `TEST_ATTENDEE_B_EMAIL=<email>` (and reuse
  `TEST_USER_PASSWORD`). The setup project
  [auth.attendee-b.setup.ts](../../../tests/e2e/auth.attendee-b.setup.ts)
  will sign in and produce `.playwright/.auth/attendee-b.json`, which
  every dependent test reads.

#### Verifying what's still skipping

```bash
cd apps/web && eval "$(grep -E '^(TEST_|PLAYWRIGHT_BASE_URL|SUPABASE_LOCAL_SIGNOUT)' .env.local | sed 's/^/export /')" \
  && pnpm exec playwright test --reporter=list 2>&1 \
  | grep -E '^\s*-\s|skipped' | sort -u
```

Each `- <spec> › <test>` line is followed by the `test.skip()` reason
string from this doc's groupings.

The cached session and any HTML report / trace artifacts are gitignored at the
repo root.

## Test user

Create a dedicated account in your dev/preview Supabase project (never reuse a
production user). The setup project signs in via the standard
`/login` form, so the user only needs an email + password — no special role.

For authenticated tests that mutate data (RSVP, host event), use a user whose
data is safe to churn — and follow the hygiene rules above.
