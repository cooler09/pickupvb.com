# Bundle: E2E Phase 0 increment B — helper extraction, withAuthContext, skip-budget guard

Closes the remaining Phase 0 reliability-foundation items from
[docs/audits/e2e-tests.md](../audits/e2e-tests.md): the `navigation.ts` (#6)
and `browser.ts` / `withAuthContext` (#8) helpers, the skip-budget guard (C1),
and the latent `isVisibleOrTimeout` no-op-timeout follow-up flagged in
[increment A](2026-05-30-bundle-e2e-phase0-increment-a.md).

**Date:** 2026-05-30
**Scope:** Test infra only — `apps/web/tests/e2e/_helpers/*` + the four authed
specs that consumed the duplicated helpers + `playwright.config.ts`. No app code.

## Context

Increment A swept the `.catch(() => false)` probes and confirmed `networkidle`
was already gone, but explicitly deferred four items "to a fresh session": the
two missing helper modules (`navigation.ts`, `browser.ts`), the skip-budget
reporter, and fixing `isVisibleOrTimeout`'s `timeout` arg (a Playwright no-op
because `isVisible({ timeout })` ignores it). This bundle lands all four.

## What changed

- **`isVisibleOrTimeout` now honours `timeout`** — switched from
  `isVisible({ timeout })` (deprecated no-op snapshot) to
  `waitFor({ state: 'visible', timeout })`. The branchy `if present do X` probes
  scattered across the suite now actually poll for up to `timeout` ms instead of
  taking an instant snapshot. ([predicates.ts](../../apps/web/tests/e2e/_helpers/predicates.ts))
- **`_helpers/navigation.ts` created (#6)** — `findOwnedGroupUrl`,
  `findCaptainedTeamUrl`, `ensureSearchableDisplayName`. `findOwnedGroupUrl` was
  copy-pasted in both `groups` and `groups-manage` (the latter's comment read
  "Mirrors the helper in …"); `ensureSearchableDisplayName` was identical in
  `groups` and `teams`; `findCaptainedTeamUrl` came from `teams`. Imported in all
  three specs; ~110 lines of duplication deleted.
- **`_helpers/browser.ts` `withAuthContext(browser, storageState, fn)` (#8)** —
  wraps `newContext → newPage → try/finally close`. Adopted at the clean,
  self-contained second-context blocks: `event-host` (`beforeAll`, `afterAll`,
  the pro-sponsor test, the co-host name-fetch), `groups` and `groups-manage`
  (attendee-b name-fetch).
- **Skip-budget guard (C1)** — `_helpers/skip-budget-reporter.ts` (a Playwright
  `Reporter`) counts skipped tests and is wired into
  [playwright.config.ts](../../apps/web/playwright.config.ts) in both the CI and
  local reporter arrays.

## Decisions & alternatives

- **`findOwnedGroupUrl` unified to the trailing-slash-stripping variant**
  (`groups`'s behaviour). `groups-manage`'s callers already do
  `groupUrl.replace(/\/$/, '')` themselves, which is idempotent against a
  pre-stripped value, so unifying upward is safe; the inverse (non-stripping)
  would have produced `//members` double-slashes in `groups`.
- **`withAuthContext` adopted only where the second context is self-contained.**
  In `teams` (invite/decline/broadcast), `player-social` (mutual-follow), and the
  `event-host` broadcast test the second context lives across the whole test with
  `page`/`bPage` interleaved and cleanup that reuses `bPage` in `finally` —
  wrapping those would mean nesting the entire test body in the callback and
  rewriting control flow (early `test.skip` returns), a risky change for brittle
  specs with no behavioural payoff. Left as-is; the helper still exists for them
  to adopt when those tests are rewritten (Phase 1+). Net: the helper centralises
  the "always close" guarantee and stops swallowing `.close()` errors (some sites
  did `await ctx.close().catch(() => {})`); withAuthContext lets a real close
  failure surface, which is the audit's intent.
- **Skip-budget defaults to warn-only; enforces only when `E2E_SKIP_BUDGET=<N>`
  is set.** The audit's open decision #1 (what N? fail or warn?) is genuinely the
  maintainer's — and a fixed N would either red-fail the suite today (Phases 1–5
  still carry sanctioned `test.fixme`s) or bake in a number I can't derive. So the
  mechanism ships wired-in but inert: CI opts in by exporting the env var once a
  baseline is agreed. Set N to the count of sanctioned infra-gated skips so
  converting a fixme to a real test can only lower it — a ratchet.

## Verification

- **e2e tsc baseline unchanged at 23.** e2e specs are excluded from `pnpm
typecheck` (`tsconfig` includes only `src/**`) and `pnpm lint` (`tests/**`
  ignored), so — as in increment A — I used a throwaway
  `tsconfig.e2e.tmp.json` (`include: tests/**`, `types: [node]`,
  `incremental: false` to defeat `.tsbuildinfo` caching) and deleted it before
  hand-off. Post-edit per-file distribution is **identical** to the stashed-HEAD
  baseline: tournament 14, groups-manage 6, auth-extended 2, player-social 1
  = 23. **Zero added.** (Increment A's "tournament 14" count was right — an
  earlier read here said "12 + groups.authed 2" but that was a stale
  `.tsbuildinfo` artifact from running `tsc` with the base config's
  `incremental: true`; with `incremental: false` it is 14.) All 23 are the
  pre-existing single-arg `test.skip`/`test.fixme` bug + `groupUrl`-null,
  owned by later phases.
- **Caught one self-inflicted error before hand-off:** the reporter's `onEnd`
  first returned `{ status?: ... } | void`, which isn't assignable to the
  `Reporter` base type (TS2416) — fixed to `async onEnd(): Promise<{ status:
FullResult['status'] } | undefined>`. This is _why_ the throwaway typecheck
  matters for `_helpers/*`: a new reporter is real TS that nothing else checks.
- **`playwright --list`: 186 tests in 30 files** — every spec transpiles and the
  config (now referencing the new reporter) loads cleanly; the reporter's
  `onEnd` fires (`[skip-budget] 0 skipped tests.`), proving it's wired.
- **prettier**: all touched files report unchanged.

## Follow-ups

- **Per-worker storage state (#3)** — the one Phase 0 item still open (it was the
  "optionally take it here" item). The `workers=2` ceiling on remote targets
  remains the documented workaround.
- **`withAuthContext` adoption at the interleaved-context sites** (teams,
  player-social, event-host broadcast) — do it when those specs are rewritten in
  Phase 1+, where the SRP split (#9) for `event-host` also lands.
- **Pick an `E2E_SKIP_BUDGET` N and wire it into `e2e-develop.yml`** — maintainer
  decision (audit open decision #1). Until then the guard prints the count.
- The 23 pre-existing e2e tsc errors should be fixed as their owning phases land
  (the single-arg `test.skip`/`test.fixme` is a one-liner per call).

## Cross-references

- Audit: [docs/audits/e2e-tests.md](../audits/e2e-tests.md) — findings #6, #8,
  C1, C7 and the Phase 0 row of the game plan.
- Prior: [increment A journal](2026-05-30-bundle-e2e-phase0-increment-a.md).
