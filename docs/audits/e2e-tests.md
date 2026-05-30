# E2E tests — quality & coverage audit

> **Status (2026-05-30):** Coverage pass + phased game plan. The 2026-05-25
> audit below was a DRY/SOLID review of the test _code_; this pass adds the
> missing _coverage_ lens and a roadmap. **The DRY/SOLID findings stand —
> read them too**; the coverage section just sits on top.
>
> **What landed since 2026-05-25:** the `_helpers/` layer now exists —
> [auth.ts](../../apps/web/tests/e2e/_helpers/auth.ts) (`defineAuthSetup` /
> `skipIfMissingAuth`), [paths.ts](../../apps/web/tests/e2e/_helpers/paths.ts)
> (`STORAGE_PATHS`), [predicates.ts](../../apps/web/tests/e2e/_helpers/predicates.ts)
> (`isVisibleOrTimeout`), [event-create.ts](../../apps/web/tests/e2e/_helpers/event-create.ts)
> (`createFreeOpenPlayEvent` / `createPaidEvent` / `cancelEvent` /
> `pickFutureDateTime`), [cleanup.ts](../../apps/web/tests/e2e/_helpers/cleanup.ts)
> (opt-in admin deletes), and [stripe.ts](../../apps/web/tests/e2e/_helpers/stripe.ts)
> (Checkout drivers). That **resolves P2 #4, #5, #7** and the proposed
> `events.ts` helper — see the remediation log. **Resolved since** (Phase 0
> increments A + B): the `.catch(() => false)` / `networkidle` sweep (C7),
> `navigation.ts` (#6), `browser.ts` / `withAuthContext` (#8), the
> `isVisibleOrTimeout` no-op-timeout fix, and the skip-budget guard (C1).
> **Still open** from that pass: per-worker storage state (#3).
>
> **Headline:** the suite is _broad_ (~30 specs, ~180 `test()` cases) but
> _shallow exactly where the risk is_. The newest, highest-stakes features —
> **leagues, brackets, divisions, payments** — are read-only page-loads plus
> `test.fixme` placeholders, so a green run exercises **zero** mutating
> tournament or payment paths. The reliability spine is **C1**: the
> defensive-skip / `test.fixme` habit that lets _absent_ coverage report as
> green. Direction set with the maintainer (2026-05-30): **self-provisioning
> tests** (each mutating test creates and tears down its own fixture) over a
> shared seed, and **all four feature areas in scope**. Game plan in the next
> section.

> **Status (2026-05-25):** New audit. Triggered by repeated remediation
> loops on `event-host.authed.spec.ts` (co-host add/remove) where
> `waitForLoadState('networkidle')` and copy-pasted selectors caused
> false negatives. Scope: every spec under
> [apps/web/tests/e2e/](../../apps/web/tests/e2e/) plus the seven
> `auth.*.setup.ts` files and [playwright.config.ts](../../apps/web/playwright.config.ts).
>
> Headline: the suite has grown to ~30 specs without an
> `_helpers/` / page-object layer. Each new spec copies idioms from the
> nearest sibling and small drift accumulates. Two findings (`networkidle`
> waits, defensive `.catch(() => false)`) are actively causing flake.
> The auth-setup-factory and per-worker-storage-state extractions are the
> highest-leverage P2s.

## Coverage audit & game plan (2026-05-30)

### Method & confidence

Built from the verified file inventory under
[apps/web/tests/e2e/](../../apps/web/tests/e2e/), the per-spec
`test()` / `.skip` / `test.fixme` counts, and the helper inventory.
File-level links are exact; **line anchors are intentionally omitted** in
this section because the `test.fixme` blocks move every bundle. The
[e2e README](../../apps/web/tests/e2e/README.md) "Unblocking skipped tests"
section is the companion blocker taxonomy and stays the source of truth for
_why_ a given flow is parked.

### Current coverage snapshot

Depth legend — ✅ exercises a mutating flow · 🟡 read-only / page-load ·
⛔ none (or `test.fixme` only).

| Feature area                  | Primary spec                                                                    | Depth | Note                                                                |
| ----------------------------- | ------------------------------------------------------------------------------- | :---: | ------------------------------------------------------------------- |
| Public smoke / nav / auth     | `smoke` · `navigation` · `auth.public` · `auth-extended.public`                 |  🟡   | Appropriate — GET-only by design                                    |
| Players / groups (public)     | `players.public` · `groups.public`                                              |  🟡   | Directory search + public profile                                   |
| Accessibility / SEO           | `accessibility.public` · `meta-seo.public`                                      |  🟡   | Viewport, focus, theme, meta tags                                   |
| Profile edit                  | `profile` · `profile-edit`                                                      |  ✅   | Edit + restore display name / city / handle / prefs                 |
| Event create + RSVP           | `events`                                                                        |  ✅   | `/events/new`, RSVP join/leave                                      |
| Host management               | `event-host`                                                                    |  ✅   | Create/edit/cancel/cohost — but brittle (see #9 SRP)                |
| Event attendance              | `event-attendance`                                                              |  🟡   | Position RSVP only; **paid / capacity / tip = fixme**               |
| Teams                         | `teams`                                                                         |  🟡   | Create `@destructive`; **invite / remove / broadcast = fixme**      |
| Groups / community            | `groups` · `groups-manage` · `community`                                        |  ✅   | Follow, create+delete listing; **members flow partly fixme**        |
| Hero images                   | `hero-image`                                                                    |  ✅   | Upload/remove on profile / event / group                            |
| Authorization / visibility    | `authorization` · `visibility-gating`                                           |  ✅   | Redirect / guard assertions                                         |
| Notifications                 | `notifications`                                                                 |  🟡   | Bell + panel; **worker / reminders / email = ⛔**                   |
| Billing / Pro                 | `billing-stripe`                                                                |  🟡   | Page loads only                                                     |
| **Brackets**                  | `tournament`                                                                    |  🟡   | Page-load only; **6 bracket mutations = fixme** (incl. advancement) |
| **Divisions**                 | `tournament`                                                                    |  ⛔   | Create-only; registration/winner = fixme                            |
| **Leagues**                   | _none_                                                                          |  ⛔   | Zero references anywhere — not even a fixme                         |
| **Payments / Stripe**         | `billing-stripe` · `event-attendance` · `refund-window-gating`                  |  ⛔   | `stripe.ts` helper exists; every paid flow is fixme                 |
| Admin                         | `admin`                                                                         |  ⛔   | All fixme — needs multi-actor fixtures                              |
| Schedule / scoreboard / tools | _none_ (`events/[id]/schedule`, `tools/scoreboard`)                             |  ⛔   | No spec                                                             |
| Short links / claim           | partial (`/e/<code>` via `tournament`)                                          |  ⛔   | `s/[code]`, `claim/` untested                                       |
| CSV / API routes              | _none_ (`api/.../statement.csv`, `api/events/[id]/join`, `api/notifications/*`) |  ⛔   | No request-context coverage                                         |

### Coverage findings (graded)

#### C1 (P1) — Defensive skips + `test.fixme` placeholders let absent coverage pass green

The suite's biggest risk isn't a flaky test — it's a _green_ test that runs
nothing. `test.fixme` bodies are empty and always skip; precondition probes
`test.skip` when ambient data is missing. The worst offenders by skip/fixme
density: [tournament.authed.spec.ts](../../apps/web/tests/e2e/tournament.authed.spec.ts)
(read-only + ~14 fixme), [event-attendance.authed.spec.ts](../../apps/web/tests/e2e/event-attendance.authed.spec.ts),
[teams.authed.spec.ts](../../apps/web/tests/e2e/teams.authed.spec.ts),
[billing-stripe.authed.spec.ts](../../apps/web/tests/e2e/billing-stripe.authed.spec.ts),
[admin.authed.spec.ts](../../apps/web/tests/e2e/admin.authed.spec.ts),
[groups-manage.authed.spec.ts](../../apps/web/tests/e2e/groups-manage.authed.spec.ts).

**Fix (the reliability contract — see below):** convert each fixme to a
self-provisioning test that creates and tears down its own fixture, and make
a missing precondition that the test _should have created_ a hard **failure**,
not a skip. Reserve `test.skip` for sanctioned infra gates only (Stripe test
run, email inbox, deploy-flag), gate those behind explicit env flags, and add
a **skip-budget** guard so a regression can't silently inflate the skip count.

#### C2 (P1) — Leagues: zero coverage

No league spec exists; the only references are zero — not one `test.fixme` exists in
[tournament.authed.spec.ts](../../apps/web/tests/e2e/tournament.authed.spec.ts).
This is the newest feature area (journal: `league-schedule-ui`,
`league-team-forfeit`, `p1-2-league-schedule`) and the match-result write path
is a `SECURITY DEFINER` RPC (`record_league_match_result`), exactly where a
silent RLS/authorization regression would hide.

**Fix:** new `league.authed.spec.ts`. Self-provision a league event via a new
`createLeague` helper (or a `[E2E]`-prefixed seed), then cover: schedule
generation, standings update after a recorded result, and team forfeit. Drive
[league-team-actions.ts](../../apps/web/src/app/events/[id]/league-team-actions.ts)
and [schedule/actions.ts](../../apps/web/src/app/events/[id]/schedule/actions.ts).

#### C3 (P1) — Brackets: read-only only; advancement + captain RLS untested

[tournament.authed.spec.ts](../../apps/web/tests/e2e/tournament.authed.spec.ts)
asserts the bracket _page renders_; all six mutations (register / withdraw /
rename / free-agent / seed / **record-result-advances-winner**) are fixme.
Highest-value gap because match-result writes go through the captain-vs-host
authorization path (journal: `captain-rls-match-result`,
`record_bracket_match_result` RPC; AGENTS pitfall #8) and winner advancement
touches a downstream match the caller may not own.

**Fix:** new `bracket.authed.spec.ts`. Self-provision a roster tournament +
division + seeded bracket (a disposable clone — keep the persistent `E2ETFR`
seed for read-only). Assert a recorded result **advances the winner into the
next match**, and assert a non-captain / non-host is **rejected**. Drive
[bracket/actions.ts](../../apps/web/src/app/events/[id]/bracket/actions.ts).

#### C4 (P2) — Divisions: multi-division registration unverified

[division-actions.ts](../../apps/web/src/app/events/[id]/division-actions.ts)
and [record-division-winner-actions.ts](../../apps/web/src/app/events/[id]/record-division-winner-actions.ts)
are untested beyond multi-division _creation_ (registration into a chosen division and the division-winner path are not covered). The multi-division `division_id` requirement (AGENTS
pitfall #6 — the DB trigger only fills it for single-division events) is a
boundary that breaks silently.

**Fix:** `divisions.authed.spec.ts`. Self-provision a 2-division event;
register a team and assert it lands in the **chosen** division; record a
division winner. Pairs naturally with C3 (same tournament fixture).

#### C5 (P2) — Payments / Stripe: helpers exist, no green checkout flow

[stripe.ts](../../apps/web/tests/e2e/_helpers/stripe.ts) already drives the
hosted Checkout (`fillStripeCheckout`, `clickConfirmedSubmit`, `waitForStripeRedirect`, `expectStripeDeclineError`, `pollUiFor`) but
every paid flow is fixme: paid RSVP, team/roster checkout, tips, refund-window
gating, and Pro subscription. Files:
[billing-stripe.authed.spec.ts](../../apps/web/tests/e2e/billing-stripe.authed.spec.ts),
[event-attendance.authed.spec.ts](../../apps/web/tests/e2e/event-attendance.authed.spec.ts),
[refund-window-gating.authed.spec.ts](../../apps/web/tests/e2e/refund-window-gating.authed.spec.ts).

**Fix:** stand up the Stripe-test fixture run — a `stripe-host` with Connect
onboarded ([auth.stripe-host.setup.ts](../../apps/web/tests/e2e/auth.stripe-host.setup.ts)
is already wired) and the permanent dev webhook endpoint (tests do not spawn `stripe listen` — they `pollUiFor` the webhook-driven state after Checkout)
for webhook-driven assertions. Convert the fixmes to real tests gated behind
the existing `shouldSkipStripeTests()` gate — a **genuine** infra gate
(`SKIP_STRIPE_E2E=1` and localhost both opt out) → a sanctioned loud-skip
under the skip budget, not a silent fixme. Use the `4242…` success and
`4000…0002` decline cards already documented in `stripe.ts`.

#### C6 (P3) — Untested surfaces

No spec touches: the event **schedule** page (`events/[id]/schedule`),
**scoreboard** tools (`tools/scoreboard` + `/remote`), the **claim** flow
(`claim/`), `s/[code]` short links, **receipts/earnings CSV**
(`api/receipts/[year]/statement.csv`, `api/earnings/[year]/statement.csv`),
and the notification **worker / reminders / outbox** API routes.

**Fix:** add focused smoke specs as each lands in a phase. CSV + API routes
are cheapest asserted via Playwright's `request` context (GET + status +
content-type) rather than a full page nav.

#### C7 (P2) — Reliability remediation incomplete (carries P1 #1 / #2 forward)

> **Update (2026-05-30, increment B):** Phase 0's remaining items are **done.**
> `navigation.ts` (#6) and `browser.ts` / `withAuthContext` (#8) now exist and
> are adopted (see remediation log); the skip-budget guard (C1) is wired into
> `playwright.config.ts` (warn-only until `E2E_SKIP_BUDGET=<N>` is exported, then
> it fails the run when the skip count exceeds N); and the `isVisibleOrTimeout`
> no-op flagged below is **fixed** — it now uses `waitFor({ state: 'visible',
timeout })`, so the `timeout` arg actually polls. Verified: e2e tsc baseline
> unchanged at 23 (identical per-file: tournament 14 / groups-manage 6 /
> auth-extended 2 / player-social 1), `playwright --list` parses all 186 tests.
> Only **#3 (per-worker storage state)** remains open in Phase 0. See the
> [increment-B journal entry](../journal/2026-05-30-bundle-e2e-phase0-increment-b.md).
>
> **Update (2026-05-30):** the **`.catch(() => false)` sweep is done** —
> 42 → 1 suite-wide; the one survivor is a response-promise coercion in
> `event-host`, not a visibility probe. **`networkidle` was already done**
> (the remaining grep hits are comments explaining why it's avoided; zero
> real `waitForLoadState('networkidle')` calls). Both verified type-clean
> (e2e tsc baseline unchanged at 23) and `playwright --list` parses all
> 186 tests. See the remediation log and the
> [Phase 0 increment-A journal entry](../journal/2026-05-30-bundle-e2e-phase0-increment-a.md).
> Still open under C7: the `browser.ts` / `navigation.ts` helpers and the
> skip-budget guard (deferred to a later increment), plus a latent
> follow-up — `isVisibleOrTimeout`'s `timeout` arg is a Playwright no-op
> (`isVisible({ timeout })` is ignored), so it never actually waits.

`isVisibleOrTimeout` exists but isn't fully adopted, and `networkidle`
survives in only ~5 occurrences across 3 specs (`authorization`, `event-host`, `profile-edit`); the larger residue is the ~42 raw `.catch(() => false)` sites, and `isVisibleOrTimeout` is adopted in only 10 specs (e.g.
[event-attendance.authed.spec.ts](../../apps/web/tests/e2e/event-attendance.authed.spec.ts),
[groups-manage.authed.spec.ts](../../apps/web/tests/e2e/groups-manage.authed.spec.ts),
[teams.authed.spec.ts](../../apps/web/tests/e2e/teams.authed.spec.ts),
[regression.authed.spec.ts](../../apps/web/tests/e2e/regression.authed.spec.ts),
[auth-extended.public.spec.ts](../../apps/web/tests/e2e/auth-extended.public.spec.ts)).

**Fix:** finish the sweep — replace remaining `networkidle` with deterministic
assertions and raw `.catch(() => false)` with `isVisibleOrTimeout`. This is
Phase 0 work; it must land before the brittle specs get _more_ flows piled on.

### The reliability contract (self-provisioning)

The pattern every **mutating** test must follow once Phase 0 lands:

1. **Arrange** — create the fixture through a `_helpers` factory
   (`createFreeOpenPlayEvent` today; `createRosterTournament`,
   `createLeague`, `createTeam` to be added). Name it with the `[E2E]` /
   `E2E Test ` prefix so the [cleanup](../../apps/web/tests/e2e/_helpers/cleanup.ts)
   sweep can reclaim leaks.
2. **Teardown** — record the id and delete it in `afterAll`
   (`cancelEvent` / `deleteEventById` / `deleteTeamBySlug`). Cleanup is
   opt-in via `E2E_CLEANUP_SUPABASE_*`; document that requirement next to
   the run command.
3. **Act / assert against the just-created fixture** — never ambient dev
   data. This is what kills the "no event in this environment" skips.
4. **Missing self-provisioned precondition ⇒ `expect(...).toBeTruthy()`
   FAIL**, never `test.skip`. A test that couldn't build its own fixture is
   a _broken test_, and should be loud.
5. **`test.skip` is reserved for sanctioned infra gates** (Stripe run, email
   inbox, deploy flag), each behind an explicit env flag and counted against
   a **skip budget** the run fails on if exceeded.
6. **Keep the persistent `E2ETFA` / `E2ETFR` seeds for read-only assertions;**
   mutations create disposable clones so they never corrupt the shared seed.

### Game plan (phased)

Ordered by risk-reduction per unit of work. Each phase ends green with **no
new silent skips**.

|  Phase   | Theme                  | Findings       | Exit criteria                                                                                                                                                                                                                       |
| :------: | ---------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** ✅ | Reliability foundation | C1, C7, #6, #8 | **Done** (increments A+B; per-worker storage #3 deferred): `networkidle`/`catch` swept; `isVisibleOrTimeout` fixed; `navigation.ts` + `browser.ts` exist + adopted; skip-budget guard wired (warn-only until `E2E_SKIP_BUDGET` set) |
|  **1**   | Brackets               | C3             | Result-advances-winner + captain/host authorization tested against a self-provisioned bracket                                                                                                                                       |
|  **2**   | Leagues                | C2             | `league.authed.spec.ts`: schedule gen, standings, forfeit                                                                                                                                                                           |
|  **3**   | Divisions              | C4             | Multi-division registration lands in the chosen division; division winner recorded                                                                                                                                                  |
|  **4**   | Payments / Stripe      | C5             | Paid RSVP, team/roster checkout, tip, refund-window, Pro — green on dev; localhost auto-skips                                                                                                                                       |
|  **5**   | Surface fill-in        | C6             | schedule, scoreboard, short links, claim, CSV/API smoke                                                                                                                                                                             |

**Phase 0 — Reliability foundation (do first; everything else compounds on it).**
Finish C7's `networkidle`/`catch` sweep. Add the two missing helpers the
multi-actor coverage needs: `browser.ts` `withAuthContext(browser, state, fn)`
(P2 #8) and `navigation.ts` for the duplicated `findOwnedGroupUrl` /
`findCaptainedTeamUrl` / `ensureSearchableDisplayName` (P2 #6). Write the
self-provisioning helpers the later phases consume (`createRosterTournament`,
`createLeague`, `createTeam`) alongside the existing `createFreeOpenPlayEvent`.
Add a skip-budget assertion (fail the run if sanctioned skips exceed N).
Optionally take the per-worker storage-state fix (#3) here so later parallel
suites don't reintroduce the refresh-token race.

**Phase 1 — Brackets (C3).** Highest risk: advancement + captain RLS. One
self-provisioned roster tournament with a seeded bracket; assert winner
advancement and the non-captain/non-host rejection. Split host-flow brittleness
(#9) opportunistically while in this area.

**Phase 2 — Leagues (C2).** New spec + `createLeague`. Schedule generation,
standings after a result, forfeit. Mirror the bracket authorization assertions
for the league RPC.

**Phase 3 — Divisions (C4).** Reuse the Phase-1 tournament fixture; assert
`division_id` routing and the division-winner path.

**Phase 4 — Payments / Stripe (C5).** Stand up the Stripe-test run
(Connect-onboarded host + the permanent dev webhook endpoint; `pollUiFor` after Checkout). Convert the paid fixmes; assert
both the success card and the decline card, plus the refund-window gate.

**Phase 5 — Surface fill-in (C6).** Cheap smoke for the remaining ⛔ surfaces;
CSV/API via the `request` context.

### Open decisions for these phases

1. **Skip budget threshold + CI wiring** — what N, and fail the run or just
   warn? (Recommend: fail above the count of sanctioned infra-gated skips.)
2. **Stripe paid flows in the standard dev run or a separate workflow?** They
   need the permanent dev webhook + a non-localhost target and run slower
   (Checkout round-trip + `pollUiFor`) — likely their own manual /
   nightly job, not the per-deploy `e2e-develop.yml`.
3. **Disposable-clone vs. shared-seed for tournament mutations** — the
   contract says clone; confirm the seed snippet can be parameterized for a
   `[E2E]`-prefixed throwaway so Phase 1/3 don't churn `E2ETFR`.

## Findings

### P1

#### 1. `page.waitForLoadState('networkidle')` everywhere — 50+ sites, primary flake source

Already removed from [authorization.authed.spec.ts](../../apps/web/tests/e2e/authorization.authed.spec.ts#L17)
after it timed out hard against `dev.pickupvb.com` (network is never
idle long enough — analytics beacons + Sentry + Vercel Speed Insights
keep firing past 30s).

Concrete offenders:

- [regression.authed.spec.ts](../../apps/web/tests/e2e/regression.authed.spec.ts#L60) and 7 more in the same file
- [groups.authed.spec.ts](../../apps/web/tests/e2e/groups.authed.spec.ts#L22) and 11 more in the same file
- [event-host.authed.spec.ts](../../apps/web/tests/e2e/event-host.authed.spec.ts#L137) and 9 more in the same file
- [teams.authed.spec.ts](../../apps/web/tests/e2e/teams.authed.spec.ts#L21) and 10 more in the same file
- [profile-edit.authed.spec.ts](../../apps/web/tests/e2e/profile-edit.authed.spec.ts#L88) and 5 more in the same file
- [events-browse.public.spec.ts](../../apps/web/tests/e2e/events-browse.public.spec.ts#L29) and 2 more in the same file

**Fix:** remove every call. Two replacement patterns:

```ts
// 1. If a deterministic element follows, just assert it — locator auto-retries.
await page.goto('/events');
await expect(page.locator('a[href*="/events/"]').first()).toBeVisible();

// 2. If you genuinely need "DOM is parsed", use 'domcontentloaded'.
await page.goto('/some-page', { waitUntil: 'domcontentloaded' });
```

`networkidle` is officially [discouraged by Playwright](https://playwright.dev/docs/api/class-page#page-wait-for-load-state-option-state)
("DISCOURAGED. The 'networkidle' value is not reliable") for exactly
this reason.

#### 2. Defensive `.catch(() => false)` / `.catch(() => {})` masking real failures

30+ sites swallow every error including selector typos and 500s.

- [event-host.authed.spec.ts#L96](../../apps/web/tests/e2e/event-host.authed.spec.ts#L96) — `isVisible({ timeout: 2_000 }).catch(() => false)` for the host-action probe
- [authorization.authed.spec.ts#L43](../../apps/web/tests/e2e/authorization.authed.spec.ts#L43) — same pattern, host-page detection
- [groups.authed.spec.ts#L141](../../apps/web/tests/e2e/groups.authed.spec.ts#L141)
- [hero-image.authed.spec.ts#L35](../../apps/web/tests/e2e/hero-image.authed.spec.ts#L35)
- [player-social.authed.spec.ts#L65](../../apps/web/tests/e2e/player-social.authed.spec.ts#L65)
- Multiple `await ctx.close().catch(() => {})` in teardown

**Fix:** narrow the swallow to the expected error class. Helper in
`tests/e2e/_helpers/predicates.ts`:

```ts
// Treats only TimeoutError as "not visible". Anything else (e.g. strict-mode
// violation, navigation, target closed) rethrows so failures surface.
export async function isVisibleOrTimeout(locator: Locator, timeout = 2_000): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch (err) {
    if (err instanceof Error && /Timeout|exceeded/.test(err.message)) return false;
    throw err;
  }
}
```

For teardown, accept only `Target closed` / `already closed`; rethrow
everything else.

#### 3. Supabase refresh-token race + shared storageState

[playwright.config.ts#L31-L40](../../apps/web/playwright.config.ts#L31-L40)
documents the issue: `fullyParallel: true` + shared `STORAGE_STATE` +
Supabase rotating refresh tokens = workers stomping each other's
sessions. Workaround is `workers: 2` (or 1 on CI) which leaves
parallelism on the table.

**Fix (proper):** per-worker storage state. Two options:

1. Run a small pre-suite that exchanges the saved access token for N
   independent sessions (one per worker) using Supabase admin API, and
   write `.playwright/.auth/user-<i>.json`. The authed project picks
   one by `testInfo.workerIndex`.
2. Switch authed specs to a [Playwright fixture](https://playwright.dev/docs/test-fixtures)
   that calls `signInProgrammatically(workerIndex)` and stores the
   result in a per-worker file, then reuses it for every test on that
   worker.

Until then, **document the workers=2 ceiling as a P1 known limitation**
(not just a config comment) so future contributors don't crank it up
chasing throughput.

### P2

#### 4. Seven near-identical `auth.*.setup.ts` files

[auth.setup.ts](../../apps/web/tests/e2e/auth.setup.ts),
[auth.attendee-b.setup.ts](../../apps/web/tests/e2e/auth.attendee-b.setup.ts),
[auth.free-host.setup.ts](../../apps/web/tests/e2e/auth.free-host.setup.ts),
[auth.pro-host.setup.ts](../../apps/web/tests/e2e/auth.pro-host.setup.ts),
[auth.stripe-host.setup.ts](../../apps/web/tests/e2e/auth.stripe-host.setup.ts),
[auth.admin.setup.ts](../../apps/web/tests/e2e/auth.admin.setup.ts) —
differ only in `EMAIL`, `PASSWORD`, and `STORAGE_STATE`.

**Fix:** factory in `tests/e2e/_helpers/auth.ts`:

```ts
export function defineAuthSetup(opts: {
  email: string | undefined;
  password: string | undefined;
  storagePath: string;
  role: string;
}) {
  setup(`authenticate ${opts.role}`, async ({ page }) => {
    if (!opts.email || !opts.password) {
      setup.skip(true, `${opts.role}: env vars missing`);
      return;
    }
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(opts.email);
    await page.getByLabel(/password/i).fill(opts.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/(events|profile)/, { timeout: 15_000 });
    fs.mkdirSync(path.dirname(opts.storagePath), { recursive: true });
    await page.context().storageState({ path: opts.storagePath });
  });
}
```

Each setup file collapses to two lines.

#### 5. `fs.existsSync(STATE_PATH); test.skip()` boilerplate in ~15 places

Same lines repeat across [event-host.authed.spec.ts#L274](../../apps/web/tests/e2e/event-host.authed.spec.ts#L274),
[groups.authed.spec.ts#L246](../../apps/web/tests/e2e/groups.authed.spec.ts#L246),
[event-attendance.authed.spec.ts#L26](../../apps/web/tests/e2e/event-attendance.authed.spec.ts#L26),
[player-social.authed.spec.ts#L220](../../apps/web/tests/e2e/player-social.authed.spec.ts#L220),
[regression.authed.spec.ts#L115](../../apps/web/tests/e2e/regression.authed.spec.ts#L115),
[groups-manage.authed.spec.ts#L217](../../apps/web/tests/e2e/groups-manage.authed.spec.ts#L217).

**Fix:** `skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b')` in
the same helper module.

#### 6. Page-object helpers copy-pasted between sibling specs

- `findOwnedGroupUrl` exists in [groups.authed.spec.ts#L20](../../apps/web/tests/e2e/groups.authed.spec.ts#L20) **and** [groups-manage.authed.spec.ts#L30](../../apps/web/tests/e2e/groups-manage.authed.spec.ts#L30) — file source comment literally says "Mirrors the helper in groups.authed.spec.ts".
- `ensureSearchableDisplayName` duplicated in [groups.authed.spec.ts#L39](../../apps/web/tests/e2e/groups.authed.spec.ts#L39) and [teams.authed.spec.ts#L46](../../apps/web/tests/e2e/teams.authed.spec.ts#L46).
- `findCaptainedTeamUrl` ([teams.authed.spec.ts#L27](../../apps/web/tests/e2e/teams.authed.spec.ts#L27)) follows the same shape and would benefit from the same module.

**Fix:** extract to `tests/e2e/_helpers/navigation.ts` and import from both.

#### 7. Storage-state path math duplicated

Every authed spec recomputes `path.join(__dirname, '..', '..', '.playwright', '.auth', '<name>.json')`. If `.playwright/.auth/` ever moves (or we add a per-worker suffix per finding #3), it's a 10-file change.

**Fix:** central `tests/e2e/_helpers/paths.ts` exporting
`STORAGE_PATHS.{attendeeA,attendeeB,freeHost,proHost,stripeHost,admin}`.

#### 8. Multi-context boilerplate (`browser.newContext` + `try/finally close`)

[event-host.authed.spec.ts#L281-L304](../../apps/web/tests/e2e/event-host.authed.spec.ts#L281-L304),
[groups.authed.spec.ts#L252-L283](../../apps/web/tests/e2e/groups.authed.spec.ts#L252-L283),
[player-social.authed.spec.ts#L225-L245](../../apps/web/tests/e2e/player-social.authed.spec.ts#L225-L245),
[teams.authed.spec.ts#L167-L181](../../apps/web/tests/e2e/teams.authed.spec.ts#L167-L181)
— each opens a second browser context, runs work, closes in `finally`.
Some swallow `.close()` errors, some don't.

**Fix:**

```ts
// tests/e2e/_helpers/browser.ts
export async function withAuthContext<T>(
  browser: Browser,
  storageState: string,
  fn: (page: Page, context: BrowserContext) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  try {
    return await fn(page, context);
  } finally {
    await context.close();
  }
}
```

#### 9. `event-host.authed.spec.ts` is the suite's largest SRP violation

One file (~500 LOC) creates an event in `beforeAll`, then runs eight
unrelated tests against it (detail, edit, title-change, hosts section,
attendance, cancel, broadcast, co-host add/remove). Brittle because:

- Tests share mutable state — if test N fails mid-mutation, test N+1
  sees an unexpected event.
- Failure diagnosis is muddled (which test left the title wrong?).
- The recent co-host remediation cycle would have been faster against
  a focused 1-test-per-flow file.

**Fix (incremental):** split into `event-host.detail.authed.spec.ts`,
`event-host.edit.authed.spec.ts`, `event-host.cohost.authed.spec.ts`,
etc. Each owns its own `beforeAll` event via a shared
`createTestEvent(page, overrides?)` helper. Keep the cancel-in-afterAll
pattern.

Don't do this until findings #1–#4 land — moving brittle code around is
busywork.

### P3

#### 10. `test.fixme` density — 20+ placeholders cluttering the suite

[tournament.authed.spec.ts#L85-L131](../../apps/web/tests/e2e/tournament.authed.spec.ts#L85-L131) alone has 14;
[event-attendance.authed.spec.ts#L116-L308](../../apps/web/tests/e2e/event-attendance.authed.spec.ts#L116-L308) has 6.
README already documents most as "needs Stripe / needs second account /
needs inbox sandbox" under "Unblocking skipped tests".

**Fix:** move the test-intent docs into [apps/web/tests/e2e/README.md](../../apps/web/tests/e2e/README.md)
or a `docs/e2e-coverage-gaps.md` and delete the placeholder bodies.
The current state — placeholders that always skip — gives a false sense
of "we have a test for that".

#### 11. `console.error` in test source

[event-host.authed.spec.ts#L125](../../apps/web/tests/e2e/event-host.authed.spec.ts#L125)
prints inside `beforeAll` failure path. Reporter already shows the
error; the `console.error` is noise.

**Fix:** delete it.

#### 12. Dead `ATTENDEE_A_STATE` constant

[event-attendance.authed.spec.ts#L31](../../apps/web/tests/e2e/event-attendance.authed.spec.ts#L31)
defines `ATTENDEE_A_STATE` and never reads it.

**Fix:** delete (or absorb into `STORAGE_PATHS` from finding #7 and
import what's used).

## Recommended helper module layout

```
apps/web/tests/e2e/_helpers/
├── paths.ts          STORAGE_PATHS, AUTH_DIR constants (P2 #7)
├── auth.ts           defineAuthSetup, skipIfMissingAuth (P2 #4, #5)
├── browser.ts        withAuthContext (P2 #8)
├── predicates.ts     isVisibleOrTimeout (P1 #2)
├── navigation.ts     findOwnedGroupUrl, findCaptainedTeamUrl,
│                     ensureSearchableDisplayName (P2 #6)
└── events.ts         createTestEvent, cancelTestEvent (enables P2 #9 split)
```

Underscore prefix matches the Next App-Router co-location convention so
it's instantly familiar.

## Open questions

1. **Page-object class vs. plain functions?** Plain functions
   (`signOut(page)`, `getHostsList(page)`) are cheaper and avoid
   constructor noise; classes (`new EventDetailPage(page).hostsList`)
   give better IDE auto-complete at scale. Suggest functions for now,
   re-evaluate if helper count crosses ~40.
2. **Per-worker storage state vs. single worker.** The right answer is
   per-worker (finding #3) but if the Stripe e2e work lands first it
   becomes harder to retrofit. Decide before scaling the suite.
3. **Stripe placeholder strategy.** Drop the `test.fixme`s now and
   re-add when the Stripe-test fixture work lands, or keep them as
   inline TODOs? Leaning drop.

## Remediation log

### 2026-05-30 — Phase 0 increment B: helpers, `withAuthContext`, skip-budget (closes #6, #8, C1)

- **#6 (`navigation.ts`) — RESOLVED.**
  [\_helpers/navigation.ts](../../apps/web/tests/e2e/_helpers/navigation.ts)
  now owns `findOwnedGroupUrl` / `findCaptainedTeamUrl` /
  `ensureSearchableDisplayName`; the copies in `groups`, `groups-manage`, and
  `teams` are deleted and import from it. `findOwnedGroupUrl` unified to the
  trailing-slash-stripping variant (idempotent for the `groups-manage` callers).
- **#8 (`browser.ts` / `withAuthContext`) — RESOLVED.**
  [\_helpers/browser.ts](../../apps/web/tests/e2e/_helpers/browser.ts) wraps
  `newContext → newPage → try/finally close`; adopted at the self-contained
  second-context blocks in `event-host` (`beforeAll`/`afterAll`/pro-sponsor/
  co-host name-fetch), `groups`, and `groups-manage`. The interleaved-context
  sites (`teams`, `player-social`, `event-host` broadcast) are intentionally
  left for the Phase 1+ rewrite — wrapping them would rewrite test control flow.
- **C1 (skip-budget guard) — RESOLVED (mechanism); threshold deferred.**
  [\_helpers/skip-budget-reporter.ts](../../apps/web/tests/e2e/_helpers/skip-budget-reporter.ts)
  is wired into [playwright.config.ts](../../apps/web/playwright.config.ts).
  Warn-only by default; fails the run when `skipped > E2E_SKIP_BUDGET`. Open
  decision #1 (the N, and fail-vs-warn in CI) preserved for the maintainer.
- **`isVisibleOrTimeout` no-op `timeout` — FIXED.** Now
  `waitFor({ state: 'visible', timeout })` instead of the ignored
  `isVisible({ timeout })`.
- **Verified:** e2e tsc baseline unchanged at **23**, identical per-file to
  stashed HEAD (tournament 14, groups-manage 6, auth-extended 2, player-social 1
  — increment A's "tournament 14" was correct; count with `incremental: false`,
  since the base config's `incremental: true` leaves a stale `.tsbuildinfo` that
  wobbles repeated counts). `playwright --list` = 186 tests / 30 files (reporter
  loads); prettier-clean. Throwaway `tsconfig.e2e.tmp.json` used and deleted.
  One self-inflicted reporter type error (`onEnd` return type, TS2416) was
  caught by this check and fixed before hand-off.
- **Still open in Phase 0:** #3 (per-worker storage state) only.
- Full rationale: [journal 2026-05-30-bundle-e2e-phase0-increment-b](../journal/2026-05-30-bundle-e2e-phase0-increment-b.md).

### 2026-05-30 — Phase 0 increment A: defensive-`catch` sweep (C7, partial)

- **`.catch(() => false)` visibility probes → `isVisibleOrTimeout`** across
  13 specs (`authorization`, `profile-edit`, `hero-image`, `admin`,
  `auth-extended.public`, `event-attendance`, `notifications`,
  `billing-stripe`, `player-social`, `groups`, `groups-manage`, `teams`,
  `event-host`). Suite-wide count **42 → 1** (the survivor is a
  response-promise coercion, not a probe).
- **`networkidle`: confirmed already done** — no real calls remain; the
  grep hits are explanatory comments. C7's "finish the sweep" is, for the
  code half, complete.
- **Verified:** e2e tsc baseline unchanged (23 pre-existing errors, zero
  added — confirmed by a throwaway `tests/**` tsconfig, since e2e specs are
  excluded from `pnpm typecheck`/`lint`); `playwright --list` parses all
  186 tests; prettier-clean. No app code or config touched.
- **Deferred** (still open under C7 / Phase 0): `browser.ts`
  `withAuthContext` (#8), `navigation.ts` (#6), skip-budget guard (C1), and
  fixing `isVisibleOrTimeout`'s no-op `timeout` arg.
- Full rationale: [journal 2026-05-30-bundle-e2e-phase0-increment-a](../journal/2026-05-30-bundle-e2e-phase0-increment-a.md).

### 2026-05-30 — helper layer landed; coverage pass added

- **P2 #4 (auth-setup factory) — RESOLVED.** `defineAuthSetup` /
  `skipIfMissingAuth` now live in
  [\_helpers/auth.ts](../../apps/web/tests/e2e/_helpers/auth.ts); the six
  `auth.*.setup.ts` files collapsed to a few lines each.
- **P2 #5 (`existsSync` skip boilerplate) — RESOLVED.** Replaced by
  `skipIfMissingAuth(STORAGE_PATHS.<role>, '<role>')`.
- **P2 #7 (storage-path math) — RESOLVED.** Central
  [\_helpers/paths.ts](../../apps/web/tests/e2e/_helpers/paths.ts)
  exports `STORAGE_PATHS`.
- **Proposed `events.ts` helper — RESOLVED** as
  [\_helpers/event-create.ts](../../apps/web/tests/e2e/_helpers/event-create.ts)
  (`createFreeOpenPlayEvent` / `createPaidEvent` / `cancelEvent` /
  `pickFutureDateTime`), plus [\_helpers/cleanup.ts](../../apps/web/tests/e2e/_helpers/cleanup.ts)
  (opt-in admin deletes) and [\_helpers/stripe.ts](../../apps/web/tests/e2e/_helpers/stripe.ts)
  (Checkout drivers) — neither was in the original layout.
- **P1 #2 (`.catch(() => false)`) — helper landed, adoption incomplete.**
  `isVisibleOrTimeout` exists in
  [\_helpers/predicates.ts](../../apps/web/tests/e2e/_helpers/predicates.ts);
  not yet swept across all specs → folded into **C7**.
- **P1 #1 (`networkidle`) — partially done.** ~5 occurrences remain →
  folded into **C7**.
- **Still open from 2026-05-25:** #3 (per-worker storage state), #6
  (`navigation.ts`), #8 (`browser.ts` / `withAuthContext`), #9
  (`event-host` SRP split), #11, #12.
- **Added this pass:** coverage findings **C1–C7** and the phased game
  plan above. No test code changed in this pass (plan/audit only).
