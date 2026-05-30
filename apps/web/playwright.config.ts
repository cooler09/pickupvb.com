import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Playwright config for PickupVB web e2e tests.
 *
 * Target environment is controlled by `PLAYWRIGHT_BASE_URL`:
 *   - Unset → assumes local dev at http://localhost:3000 and auto-starts `pnpm dev`.
 *   - Set   → tests run against that URL (e.g. a Vercel preview); no dev server boots.
 *
 * Vercel Deployment Protection: when set, `VERCEL_AUTOMATION_BYPASS_SECRET`
 * is sent as the `x-vercel-protection-bypass` header on every request so
 * password-protected previews are reachable. Generate one under Vercel project
 * Settings → Deployment Protection → "Protection Bypass for Automation".
 *
 * Auth: an authed project depends on `auth.setup.ts`, which signs in once using
 * TEST_USER_EMAIL / TEST_USER_PASSWORD and stores the session in
 * `.playwright/.auth/user.json` for the rest of the run to reuse.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const IS_LOCAL = BASE_URL.startsWith('http://localhost') || BASE_URL.startsWith('http://127.');
const STORAGE_STATE = path.join(__dirname, '.playwright/.auth/user.json');
const VERCEL_BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Per-worker auth ([tests/e2e/_helpers/fixtures.ts]) signs attendee-a in
  // independently once per worker (→ worker-<parallelIndex>.json), so the
  // Supabase refresh-token race that used to force a low cap is gone (e2e
  // audit P2 #3): independent sessions don't share a refresh-token family,
  // so one worker's rotation can't invalidate another's. Let Playwright pick
  // the count locally. CI stays serial *by choice* now — not for the race,
  // but to keep load on the shared dev env + dev Supabase auth rate limits
  // predictable; raise it once a parallel CI run is validated. Caveat: these
  // specs still read/write shared dev data, so very high worker counts can
  // surface data contention unrelated to auth.
  workers: process.env.CI ? 1 : undefined,
  // The skip-budget reporter (e2e audit C1) is appended in every mode. It is
  // warn-only until `E2E_SKIP_BUDGET=<N>` is exported, at which point it fails
  // the run when the skipped-test count exceeds N — a ratchet against silent
  // coverage loss. See tests/e2e/_helpers/skip-budget-reporter.ts.
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['./tests/e2e/_helpers/skip-budget-reporter.ts']]
    : [['list'], ['./tests/e2e/_helpers/skip-budget-reporter.ts']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: {
      // Marker so Sentry / analytics can drop e2e traffic at ingest.
      // Browser-side filtering uses `navigator.webdriver` instead, which
      // Playwright sets automatically for the same effect.
      'x-pickupvb-e2e': '1',
      ...(VERCEL_BYPASS
        ? {
            'x-vercel-protection-bypass': VERCEL_BYPASS,
            // Tells Vercel to also set a cookie so client-side nav stays bypassed.
            'x-vercel-set-bypass-cookie': 'true',
          }
        : {}),
    },
  },
  projects: [
    // Public smoke — no auth required. Runs everywhere.
    {
      name: 'public',
      testMatch: /.*\.public\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // One-time sign in; produces storageState for `authed`.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Secondary account setups — each skips gracefully if the env var is absent.
    // Authed tests check for the file with fs.existsSync before opening a context.
    {
      name: 'setup-attendee-b',
      testMatch: /auth\.attendee-b\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'setup-free-host',
      testMatch: /auth\.free-host\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'setup-pro-host',
      testMatch: /auth\.pro-host\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'setup-stripe-host',
      testMatch: /auth\.stripe-host\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'setup-admin',
      testMatch: /auth\.admin\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Authed flows reuse the cached storageState (attendee-a).
    {
      name: 'authed',
      testMatch: /.*\.authed\.spec\.ts/,
      dependencies: [
        'setup',
        'setup-attendee-b',
        'setup-free-host',
        'setup-pro-host',
        'setup-stripe-host',
        'setup-admin',
      ],
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
    },
  ],
  // Only auto-start the dev server when targeting localhost. For preview URLs,
  // the user (or CI) is responsible for the deploy being up.
  ...(IS_LOCAL
    ? {
        webServer: {
          command: 'pnpm dev',
          cwd: path.resolve(__dirname, '../..'),
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
      }
    : {}),
});
