import { test as base } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { AUTH_DIR } from './paths';
import { signIn } from './auth';

/**
 * Per-worker authentication (e2e audit P2 #3).
 *
 * `fullyParallel: true` + a single shared `user.json` as the project-level
 * `storageState` means every parallel worker drove the *same* attendee-a
 * session. Supabase rotates the refresh token on use, so the first worker to
 * refresh invalidated the others' refresh tokens and the rest of the suite
 * started redirecting to /login mid-run. The old workaround was capping
 * `workers` (2 on a remote target, 1 on CI), which left parallelism on the
 * table.
 *
 * This is Playwright's documented "one account per parallel worker" recipe
 * (https://playwright.dev/docs/auth#moderate-one-account-per-parallel-worker):
 * a worker-scoped fixture signs attendee-a in **independently** once per
 * `parallelIndex` and caches the result to `.playwright/.auth/worker-<i>.json`.
 * Each sign-in is its own session with its own refresh-token family, so a
 * rotation in one worker can't invalidate another's — the race is gone and the
 * worker cap can come off.
 *
 * Usage: authed specs import `test` / `expect` from this module instead of
 * `@playwright/test`. Everything else (`expect`, `devices`, `type Page`, …) is
 * re-exported unchanged, so the swap is a pure import-path change.
 *
 * Scope note: this fixes the **primary** (attendee-a, default `page`) session,
 * which every authed test uses. The secondary roles (attendee-b, *-host, admin)
 * are still loaded from their shared role files inside individual tests via
 * `withAuthContext` / `browser.newContext`; that residual is a much smaller
 * surface (multi-actor specs only) and is tracked as a #3 follow-up.
 */

export * from '@playwright/test';

interface WorkerAuthFixtures {
  /** Path to this worker's independent attendee-a storageState file. */
  workerStorageState: string;
}

export const test = base.extend<NonNullable<unknown>, WorkerAuthFixtures>({
  // Every test in the worker reuses the worker's own storageState, overriding
  // the project-level shared `user.json`.
  storageState: ({ workerStorageState }, use) => use(workerStorageState),

  workerStorageState: [
    async ({ browser }, use) => {
      // `parallelIndex` is 0..(workers-1) and is reused as workers recycle, so
      // the number of auth files is bounded by the worker count.
      const id = test.info().parallelIndex;
      const fileName = path.join(AUTH_DIR, `worker-${id}.json`);

      if (fs.existsSync(fileName)) {
        // Reuse the session this worker already established.
        await use(fileName);
        return;
      }

      const email = process.env.TEST_USER_EMAIL;
      const password = process.env.TEST_USER_PASSWORD;
      if (!email || !password) {
        throw new Error(
          'TEST_USER_EMAIL and TEST_USER_PASSWORD must be set to run authenticated tests.',
        );
      }

      // Fresh, sessionless context → independent sign-in → independent refresh
      // token family for this worker. `browser.newContext()` does NOT inherit
      // the project-level `use` options — that includes `use.storageState`
      // (good: we want an anonymous context) but ALSO `use.baseURL` and
      // `use.extraHTTPHeaders` (bad: `signIn`'s relative `/login` nav needs the
      // baseURL, and the e2e/Vercel-bypass headers keep this sign-in traffic
      // filtered out of telemetry and let preview deployment-protection through).
      // So carry those two across explicitly — spread, not pass-`undefined`, to
      // satisfy `exactOptionalPropertyTypes`.
      const { baseURL, extraHTTPHeaders } = test.info().project.use;
      const context = await browser.newContext({
        ...(baseURL ? { baseURL } : {}),
        ...(extraHTTPHeaders ? { extraHTTPHeaders } : {}),
      });
      const page = await context.newPage();
      await signIn(page, email, password);
      fs.mkdirSync(path.dirname(fileName), { recursive: true });
      await context.storageState({ path: fileName });
      await context.close();

      await use(fileName);
    },
    { scope: 'worker' },
  ],
});
