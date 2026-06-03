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

### Automatic end-of-run sweep (`globalTeardown`)

A per-spec UI cancel leaves a `status='cancelled'` event behind, and a captain
soft-delete leaves a `deleted_at` team behind — without `E2E_CLEANUP_SUPABASE_*`
the per-spec admin hard-delete is a no-op and those rows accumulate. So
[`global-teardown.ts`](global-teardown.ts) runs `sweepLeakedE2EFixtures()` at
the end of every run:

- **No-op without `E2E_CLEANUP_SUPABASE_*`** — a fork's `pnpm e2e` deletes
  nothing.
- **1-hour age guard** — only fixtures older than an hour are reclaimed, so a
  run executing concurrently against the same environment (fixtures always
  < 1h old) is never clobbered.
- **Opt out** with `E2E_NO_TEARDOWN_SWEEP=1` (e.g. to inspect leaked rows).

⚠️ **Never name a persisted seed entity `E2E …` (or a seed team slug `e2e-…`).**
The sweep matches that prefix and will reclaim it. The persona seed accounts /
groups / teams (docs/personas.md) use plain names for exactly this reason. The
trailing-space `E2E ` prefix deliberately does **not** match the `[E2E] …` seed
tournaments, so those survive.

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

### Persona accounts (`persona-*.spec.ts`)

The six accounts above are reused by six named personas
([docs/personas.md](../../../../../docs/personas.md)): Amy→attendee-a,
Adam→attendee-b, Julie→free-host, Mark→pro-host, Carlos→stripe-host,
Zoe→admin. The remaining personas need their own accounts. Each is
**skip-graceful** — a persona whose env var is unset has no storage state, and
`skipIfPersonaMissing` / `withPersona` (in [`_helpers/personas.ts`](_helpers/personas.ts))
skip its tests with a message naming the missing var. So the persona specs land
green before all the dev accounts exist; provision them and the tests light up.
Sign-in is registry-driven by [`auth.personas.setup.ts`](auth.personas.setup.ts)
(the single `setup-personas` project), and all share `TEST_USER_PASSWORD`:

| Env var                   | Email                              | Persona                  |
| ------------------------- | ---------------------------------- | ------------------------ |
| `TEST_CO_HOST_EMAIL`      | `zacharyjordan82+steve@gmail.com`  | Steve (P3, co-host)      |
| `TEST_LEAGUE_HOST_EMAIL`  | `zacharyjordan82+diana@gmail.com`  | Diana (P4, league)       |
| `TEST_TOURNEY_HOST_EMAIL` | `zacharyjordan82+sofia@gmail.com`  | Sofia (P5, tourneys)     |
| `TEST_NEW_HOST_EMAIL`     | `zacharyjordan82+nina@gmail.com`   | Nina (P7, no Stripe)     |
| `TEST_CAPTAIN_EMAIL`      | `zacharyjordan82+bianca@gmail.com` | Bianca (P10, captain)    |
| `TEST_FREE_AGENT_EMAIL`   | `zacharyjordan82+tyler@gmail.com`  | Tyler (P11, free agent)  |
| `TEST_POSITION_EMAIL`     | `zacharyjordan82+priya@gmail.com`  | Priya (P12, positional)  |
| `TEST_BUYER_EMAIL`        | `zacharyjordan82+marcus@gmail.com` | Marcus (P14, buyer)      |
| `TEST_WAITLIST_EMAIL`     | `zacharyjordan82+hannah@gmail.com` | Hannah (P15, waitlist)   |
| `TEST_SOCIAL_EMAIL`       | `zacharyjordan82+olivia@gmail.com` | Olivia (P16, social)     |
| `TEST_LAPSED_PRO_EMAIL`   | `zacharyjordan82+rachel@gmail.com` | Rachel (P17, lapsed Pro) |

Greg (P13, anonymous→claimed) has no account — his flow is driven at runtime by
`persona-greg-anon.public.spec.ts`. The full cast, relationships, and the seed
state each persona's tests assume (group/team membership, co-host rows, friend
edges) is the [provisioning matrix](../../../../../docs/personas.md#provisioning-matrix).

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
- `bracket.authed.spec.ts` — **mutating** bracket coverage (e2e audit C3, Phase 1). Self-provisions a disposable ad-hoc tournament via the host-only walk-in team escape hatch, then four flows: (1) recording a semifinal advances the winner into the final; (2) a non-host/non-captain viewer sees the board read-only (no result-entry form); (3) recording all matches resolves a champion (🏆 banner + "Final results"); (4) resetting a recorded semifinal reverts it and pulls the advanced team back out of the final. Uses `_helpers/tournament.ts`. Cleans up via `cancelEvent` + `deleteEventById` (opt-in `E2E_CLEANUP_SUPABASE_*`).
- `league.authed.spec.ts` — **mutating** league coverage (e2e audit C2, Phase 2). Leagues have **no UI create or team-registration path** (the `/events/new` type chooser offers only Open Play / Tournament; the event-detail signup area skips `type === 'league'`), so `_helpers/league.ts` (`createLeagueFixture`) self-provisions the event + one `roster` division + N rostered teams (captained by the host) through the **opt-in service-role admin client** — the spec is a sanctioned infra-gated skip when `E2E_CLEANUP_SUPABASE_*` / `TEST_USER_EMAIL` are unset (no other way to stand a league up). Three flows: (1) host adds a Week-1 match then records 25–10 through the user-scoped, RLS-gated `record_league_match_result` RPC (score + `Final` render on the row); (2) a non-host/non-captain viewer (attendee-b) sees the schedule read-only — no add form, no result-entry disclosure, no score inputs; (3) host marks a team forfeited in the host-tools "League teams" panel then reinstates it. Tears down via `deleteLeagueFixture` (event CASCADE + standalone team hard-delete). Note: the built league surface has no auto schedule-generation (hosts add matches manually) and no standings UI (bracket-only), so "standings after a result" is exercised as the recorded score on the schedule row.
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

#### 4. Tournament / divisions / brackets ✅ unblocked on dev

- **Files:** all of [tournament.authed.spec.ts:74-120](../../../tests/e2e/tournament.authed.spec.ts),
  plus [events.authed.spec.ts:26](../../../tests/e2e/events.authed.spec.ts)
  (multi-division creation).
- **Status:** [supabase/snippets/seed-tournament-fixture.sql](../../../../../supabase/snippets/seed-tournament-fixture.sql)
  has been applied to dev. Two published tournaments hosted by
  `TEST_FREE_HOST_EMAIL` are live there:
  - `[E2E] Ad-Hoc Tournament Fixture` (short code `E2ETFA`, `/e/E2ETFA`)
    — ad-hoc registration mode, 2 divisions, no pre-registered teams;
    target for ad-hoc captain-builds-a-team fixmes
    ([tournament.authed.spec.ts:74-84](../../../tests/e2e/tournament.authed.spec.ts#L74-L84)).
  - `[E2E] Roster Tournament Fixture` (short code `E2ETFR`, `/e/E2ETFR`)
    — roster mode, 2 divisions × 2 persistent teams captained by
    attendee-a / attendee-b / free-host / pro-host, plus a
    single-elimination bracket per division with seeded round-1
    matches; target for roster / withdraw / bracket fixmes
    ([tournament.authed.spec.ts:88-120](../../../tests/e2e/tournament.authed.spec.ts#L88-L120)).
- **Re-apply** (idempotent, safe to re-run) locally with
  `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/snippets/seed-tournament-fixture.sql`
  or against dev/preview with `psql "$SUPABASE_DB_URL" -f ...`.
- **Remaining work:** the 14 mutating `test.fixme` entries in
  [tournament.authed.spec.ts](../../../tests/e2e/tournament.authed.spec.ts)
  (team register / withdraw / rename, free-agent signup, bracket result
  recording, etc.) are still pending. They need a per-test create+cleanup
  strategy or a disposable fixture so they don't pollute the persistent
  seed. The two previously skip-graceful read-only tests at the top of
  the file have been converted to direct addressing against `/e/E2ETFR`
  and `/e/E2ETFA`, plus three new read-only assertions cover team-name
  visibility, bracket-page rendering, and the ad-hoc empty-roster state.

#### 5. Pro-only template / sponsor / analytics flows ✅ partially unblocked

- **Files:** [events.authed.spec.ts](../../../tests/e2e/events.authed.spec.ts)
  (template save validation), [event-create-extended.authed.spec.ts:224](../../../tests/e2e/event-create-extended.authed.spec.ts)
  (full template flow), [regression.authed.spec.ts:117](../../../tests/e2e/regression.authed.spec.ts)
  (template empty-name check), and [event-host.authed.spec.ts:270](../../../tests/e2e/event-host.authed.spec.ts)
  (sponsor panel — still `test.fixme`).
- **Status:** the three template tests now open a secondary browser
  context against `pro-host.json` (matching the pattern in
  [billing-stripe.authed.spec.ts](../../../tests/e2e/billing-stripe.authed.spec.ts))
  so they run as the Pro test account without affecting the default
  `[authed]` session. They skip gracefully when
  `TEST_PRO_HOST_EMAIL` (and therefore the setup-pro-host storage state)
  is absent. Inverse non-Pro check in
  [events.authed.spec.ts](../../../tests/e2e/events.authed.spec.ts)
  remains on attendee-a.
- **Remaining:** the sponsor panel fixme at
  [event-host.authed.spec.ts:270](../../../tests/e2e/event-host.authed.spec.ts)
  still needs an actual test body — open a pro-host context, navigate
  to a hosted event's manage page, and assert the sponsor card / add
  flow renders.

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

#### 8. `TEST_ATTENDEE_B_EMAIL` not set ✅ unblocked on dev

- **Files:** invite/accept/decline/broadcast paths in
  [teams.authed.spec.ts](../../../tests/e2e/teams.authed.spec.ts),
  [groups.authed.spec.ts](../../../tests/e2e/groups.authed.spec.ts),
  [groups-manage.authed.spec.ts](../../../tests/e2e/groups-manage.authed.spec.ts),
  [community.authed.spec.ts](../../../tests/e2e/community.authed.spec.ts),
  [player-social.authed.spec.ts](../../../tests/e2e/player-social.authed.spec.ts),
  [event-attendance.authed.spec.ts](../../../tests/e2e/event-attendance.authed.spec.ts),
  [event-host.authed.spec.ts](../../../tests/e2e/event-host.authed.spec.ts),
  [notifications.authed.spec.ts](../../../tests/e2e/notifications.authed.spec.ts).
- **Status:** `TEST_ATTENDEE_B_EMAIL=zacharyjordan82+attendee-b@gmail.com`
  is wired into the standard runner invocation (see the snippet at the
  top of this README). The `[setup-attendee-b]` project signs in and
  produces `.playwright/.auth/attendee-b.json`, and the dev run
  confirms it: cross-context attendee-b tests now execute and pass
  (e.g. community report, capacity-limit "event is full", groups
  add/promote/remove member, groups-manage members flow).
- **Remaining work:** the still-skipping attendee-b-flagged tests
  (notifications unread badge, teams invite/decline/broadcast,
  player friends mutual follow) skip
  for **other** reasons now — most cascade off group #1 (dynamic
  discovery couldn't find a captained team / hosted event).
  The event-host co-host + broadcast cascade off the same
  `beforeAll` event creation, which has since been fixed (see the
  callout below). Unblock the upstream group #1 and these tests will
  start running too.

##### Sub-callout: `event-host.authed.spec.ts` "Test event was not created" ✅ fixed

The `beforeAll` hook in
[event-host.authed.spec.ts](../../../tests/e2e/event-host.authed.spec.ts)
used to swallow every failure into `eventUrl = null`, which made all
7 host-flow tests + 2 attendee-b cross-context tests silently skip
with "Test event was not created; skipping". Three concrete bugs were
found and fixed:

1. A bare `test.fixme('sponsor panel — requires Pro or sponsor add-on');`
   call (one string arg) was interpreted by Playwright as
   `test.fixme(condition: truthy)` and poisoned the **entire
   `describe`** as fixme — every test was reported as `fixme` regardless
   of `beforeAll` outcome. Replaced with the proper two-arg form.
2. Filling `#addressLine` collapsed the city/region/postal/country
   fields (the form's "edit address details" disclosure). Reordered to
   fill the optional address fields after click-to-reopen if needed.
3. The post-submit redirect URL is `/events/<uuid>?created=1` — the
   waitForURL regex required end-of-string and missed the query suffix.
4. The address `123 Main St, Virginia Beach, VA 23451` failed
   server-side geocoding. Switched to a real Virginia Beach landmark
   (`1000 19th St` — convention center).

Result on dev: 6 host-flow tests now pass (event detail/edit, host
section, cancel panel, etc.), 1 sponsor test legitimately fixme'd
(Stripe gate), and 4 tests fail with **real** downstream test-logic
bugs (changed-title cache race, attendance copy mismatch, UserPicker
selector drift, broadcast leave-event affordance) — a separate
cleanup pass.

**Cleanup note:** debugging iterations created a handful of orphan
`E2E Host Test <timestamp>` events on dev because each beforeAll
attempt created one but only the successful path cancels it in
`afterAll`. Manual cleanup via the dev `/admin/events` view or a
`DELETE FROM events WHERE title LIKE 'E2E Host Test %' AND created_at < now() - interval '1 hour'`
is fine.

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
