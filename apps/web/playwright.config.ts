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
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
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
    // Authed flows reuse the cached storageState.
    {
      name: 'authed',
      testMatch: /.*\.authed\.spec\.ts/,
      dependencies: ['setup'],
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
