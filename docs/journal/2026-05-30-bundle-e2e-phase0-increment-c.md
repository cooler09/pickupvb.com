# Bundle: E2E Phase 0 increment C — per-worker auth (closes #3, Phase 0 done)

Closes the last open Phase 0 item from
[docs/audits/e2e-tests.md](../audits/e2e-tests.md): **#3 — Supabase
refresh-token race + shared `storageState`**. With this, Phase 0 (reliability
foundation) is complete; Phase 1 (brackets, C3) is next.

**Date:** 2026-05-30
**Scope:** Test infra only — new `_helpers/fixtures.ts`, an import swap in the
20 authed specs, and the `workers` line in `playwright.config.ts`. No app code.

## Context

`fullyParallel: true` + a single shared `user.json` as the authed project's
`storageState` meant every parallel worker drove the **same** attendee-a
session. Supabase rotates the refresh token on use, so the first worker to
refresh invalidated the others' refresh tokens and the rest of the suite started
redirecting to `/login` mid-run. The standing workaround was capping `workers`
(2 on a remote target, 1 on CI) — which, as the finding put it, "leaves
parallelism on the table."

## What changed

- **`_helpers/fixtures.ts` (new)** — Playwright's documented "one account per
  parallel worker" recipe. A **worker-scoped** `workerStorageState` fixture signs
  attendee-a in **independently** once per `parallelIndex`, caching to
  `.playwright/.auth/worker-<i>.json`; the test-scoped `storageState` option is
  overridden to return it. `export * from '@playwright/test'` re-exports
  everything (`expect`, `devices`, `type Page`, …) and the local `export const
test` shadows the base `test`, so adopting it is a **pure import-path swap**.
- **20 authed specs migrated** — `from '@playwright/test'` →
  `from './_helpers/fixtures'` on line 1. Nothing else in any spec changed
  (`expect` / `type Page` resolve through the re-export).
- **`workers` cap lifted** ([playwright.config.ts](../../apps/web/playwright.config.ts))
  — the remote-local `: 2` → `undefined` (Playwright picks the count);
  `IS_LOCAL` was already `undefined`; **CI stays `1` by choice** (see Decisions).

## Decisions & alternatives

- **Per-worker independent sign-in over token-exchange seeding.** The finding
  floated two options: (1) exchange the saved access token for N sessions via the
  Supabase admin API, or (2) a per-worker fixture that signs in programmatically.
  Took (2): it needs no service-role key in the test runner, reuses the existing
  `signIn` primitive from [auth.ts](../../apps/web/tests/e2e/_helpers/auth.ts),
  and is the upstream-documented pattern. Each worker's sign-in is its own
  refresh-token family, so a rotation in one can't touch another — the race is
  structurally gone, not merely narrowed.
- **CI left serial (`workers: 1`) deliberately.** The race no longer requires it,
  but lifting CI parallelism is an **unverified load change**: N workers each do
  an independent attendee-a sign-in at suite start (more `/token` calls than the
  old single setup sign-in), and these specs still read/write **shared dev data**,
  so high concurrency can surface data contention that has nothing to do with auth.
  Raising CI workers is a one-line follow-up once a parallel CI run is validated.
- **Kept the `setup` projects + `user.json` and the role files.** The worker
  fixture only fixes the **primary** (attendee-a `page`) session. Direct
  `STORAGE_PATHS.attendeeA` contexts (e.g. `event-attendance` actor A) and every
  secondary role (`attendee-b`, `*-host`, `admin`) still load their shared files,
  so the setup projects remain required. Migrating those secondary loads to
  per-worker is a much smaller surface (multi-actor specs only) and is left as a
  #3 follow-up — the headline race (shared primary session under full parallelism)
  is what this closes.

## Verification

- **e2e tsc baseline unchanged at 23**, identical per-file (tournament 14,
  groups-manage 6, auth-extended 2, player-social 1) via the throwaway
  `tsconfig.e2e.tmp.json` (`incremental: false`), deleted before hand-off.
  **`fixtures.ts` itself is clean** — and per increment B's lesson (a new
  reporter was real TS nothing else checks), a new fixture module is the same:
  the `storageState`/`workerStorageState` override types check out.
- **`playwright --list`: 186 tests in 30 files** — every migrated spec collects
  (a broken fixture import or dropped spec would change the count or fail
  collection), and the skip-budget reporter still fires.
- **NOT verified here:** the actual parallel-load payoff — that a real
  multi-worker run against `dev.pickupvb.com` no longer redirects to `/login`
  mid-suite. That needs a live run with `--workers=N` (N≥4), which is the
  maintainer's to do; the fix is structurally the documented pattern, but a
  nondeterministic race can't be soundly confirmed from a `--list`.

## Follow-ups

- **Run the suite with `--workers=4+` against dev to confirm** no auth race and
  acceptable shared-data contention; then consider lifting CI off `workers: 1`.
- **Per-worker secondary roles** (attendee-b / hosts / admin) if multi-actor
  parallelism later shows the same rotation race on those shared files.
- The 23 pre-existing e2e tsc errors remain owned by later phases (the single-arg
  `test.skip`/`test.fixme` bug is a one-liner per call).

## Cross-references

- Audit: [docs/audits/e2e-tests.md](../audits/e2e-tests.md) — finding #3, the
  Phase 0 game-plan row.
- Prior: [increment A](2026-05-30-bundle-e2e-phase0-increment-a.md) ·
  [increment B](2026-05-30-bundle-e2e-phase0-increment-b.md).
