# E2E tests — DRY/SOLID audit — 2026-05-25

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

_(empty — first audit pass)_
