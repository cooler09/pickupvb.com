# Bundle: E2E Phase 0 increment A — defensive-`catch` sweep

**Date:** 2026-05-30
**Scope:** Test-only — replaces raw `.isVisible(...).catch(() => false)`
visibility probes with the `isVisibleOrTimeout` helper across the e2e
suite. No app code, no config. First increment of the Phase 0 work in
[docs/audits/e2e-tests.md](../audits/e2e-tests.md) (finding **C7**).

## Context

The e2e coverage audit graded **C7** (reliability remediation incomplete)
as the carry-forward of the original 2026-05-25 P1 #1/#2. Two habits were
called out:

- `waitForLoadState('networkidle')` — flake source.
- raw `.catch(() => false)` after `isVisible()` — swallows _every_ error
  (selector typos, target-closed, page crashes), so a broken probe reads
  as "not visible" and the test passes green.

`_helpers/predicates.ts` already shipped `isVisibleOrTimeout`, which only
eats `TimeoutError` and rethrows everything else. The audit overstated the
remaining work; grounding it before editing changed the plan (see below).

## What changed

- Swept `.catch(() => false)` → `isVisibleOrTimeout(locator, timeout?)` in
  13 specs: `authorization`, `profile-edit`, `hero-image`, `admin`,
  `auth-extended.public`, `event-attendance`, `notifications`,
  `billing-stripe`, `player-social`, `groups`, `groups-manage`, `teams`,
  `event-host`. Added the `./_helpers/predicates` import where missing.
- Suite-wide `.catch(() => false)` count: **42 → 1**. The one remaining
  ([event-host.authed.spec.ts](../../apps/web/tests/e2e/event-host.authed.spec.ts)
  line ~437) is `sendResponsePromise.then(() => true).catch(() => false)`
  — a response-wait coerced to boolean, **not** a visibility probe, so it
  is correctly left alone.

## Decisions / alternatives

- **`networkidle` was already done.** All 5 grep hits are _comments_
  explaining why it's avoided — zero real `waitForLoadState('networkidle')`
  calls remain. The audit's "~26 occurrences" was a comment-text overcount;
  corrected in the audit's C7 entry to ~5 (comments) earlier. No code edits
  were needed for the networkidle half of C7.
- **Behaviour-preserving swap, verified against Playwright types.**
  `Locator.isVisible({ timeout })` **ignores** the `timeout` (deprecated
  no-op — instant snapshot). So both the old `.isVisible(...).catch(...)`
  and `isVisibleOrTimeout(...)` are instant snapshots; the only behavioural
  change is that non-timeout errors now surface instead of being swallowed.
  This is exactly the C7 intent.
- **Verification net built on the side, not committed.** E2E specs are
  excluded from both `pnpm typecheck` (web `tsconfig` only includes
  `src/**`) and `pnpm lint` (`tests/**` is in the eslint `ignores`). The
  repo's only standing net for these files is `playwright test --list`
  (esbuild transpile — syntax/imports, **not types**). I used a throwaway
  `apps/web/tsconfig.e2e.tmp.json` (`include: tests/**`, `types: [node]`)
  to typecheck the edits, then deleted it before hand-off (per the
  maintainer's call to keep it local-only this session). Pristine baseline
  and post-change both = **23 errors**, identical per-file
  (`tournament` 14, `groups-manage` 6, `auth-extended` 2, `player-social` 1)
  — so the sweep added **zero** type errors. The 23 are pre-existing
  (`test.fixme('string')` / `test.skip('string')` arg-type bug in
  `tournament`/`auth-extended`/`player-social`, plus `groupUrl`-null in
  `groups-manage`), owned by later phases.

## Follow-ups

- **`isVisibleOrTimeout`'s `timeout` param is a no-op** (Playwright ignores
  `isVisible({ timeout })`). Callers passing `5_000` expecting a wait don't
  get one — this predates the sweep and was preserved, not introduced. If a
  branchy probe genuinely needs to _wait_ for an element, it should
  `locator.waitFor({ state: 'visible', timeout })` instead. Worth fixing
  the helper to use `waitFor` under the hood in a later increment, then
  auditing the call sites that pass a meaningful timeout.
- **Standing e2e type net (deferred, recommended).** Add a real
  `tests/tsconfig.json` + an e2e typecheck step so the suite stops being
  invisible to `tsc`/`eslint`; fix the 23 pre-existing errors as their
  owning phases land (the `test.fixme`/`test.skip` string-arg bug is a
  one-liner per call — pass `() => {}` as the body or the proper two-arg
  form).
- **Remaining Phase 0 increments (deferred to a fresh session** — tooling
  was flaky this run): `_helpers/browser.ts` `withAuthContext` (audit #8) +
  adoption at the multi-context call sites; `_helpers/navigation.ts` to
  dedupe `findOwnedGroupUrl` (defined locally in **both** `groups` and
  `groups-manage` — copy-paste, not a shared import) / `findCaptainedTeamUrl`
  / `ensureSearchableDisplayName` (audit #6); skip-budget reporter wired into
  `playwright.config.ts` (audit C1).

## Cross-references

- Audit: [docs/audits/e2e-tests.md](../audits/e2e-tests.md) — C7, and the
  Phase 0 row of the game plan.
