import { test, expect } from '@playwright/test';

/**
 * C6 (e2e coverage audit) — focused smoke for previously-untested surfaces, the
 * cheap half that needs no auth:
 *   - cron-protected notification API routes reject unauthenticated requests,
 *   - the receipts / earnings CSV statement routes require a session,
 *   - the public scoreboard tool loads, and
 *   - the `/s/<code>` scoreboard short-link redirects (valid) / 404s (invalid).
 *
 * The API assertions use the unauthenticated `request` fixture (the public
 * project has no storageState) — the cheapest way to pin a route's auth posture,
 * per the audit's C6 note (request-context over a full page nav). The authed
 * happy-path for the CSV routes lives in `c6-surfaces.authed.spec.ts`.
 */

// Year validation (400) runs before the auth check (401) in the CSV routes, so
// the 401 assertions need a structurally valid year.
const YEAR = new Date().getFullYear();

test.describe('C6 surfaces — auth posture (unauthenticated)', () => {
  // Cron-only routes: gated on `Authorization: Bearer ${CRON_SECRET}`. Without
  // it they must 401 — a regression here would expose the worker / sweeps to
  // anyone who can reach the URL.
  for (const path of [
    '/api/notifications/worker',
    '/api/notifications/reminders',
    '/api/notifications/outbox-purge',
  ]) {
    test(`${path} rejects unauthenticated requests`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status(), `${path} should require the cron secret`).toBe(401);
    });
  }

  // Buyer / host financial exports: must require a session.
  for (const path of [
    `/api/receipts/${YEAR}/statement.csv`,
    `/api/earnings/${YEAR}/statement.csv`,
  ]) {
    test(`${path} requires authentication`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status(), `${path} should 401 without a session`).toBe(401);
    });
  }
});

test.describe('C6 surfaces — public scoreboard tool + short link', () => {
  test('the scoreboard tool loads', async ({ page }) => {
    const res = await page.goto('/tools/scoreboard');
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
  });

  test('a valid /s/<code> short-link redirects to the scoreboard remote', async ({ page }) => {
    // 'ABCD' is a valid room-code shape (4 chars from the no-ambiguous alphabet
    // ABCDEFGHJKMNPQRSTUVWXYZ23456789); `s/[code]` redirects valid codes to the
    // remote and `notFound()`s the rest.
    await page.goto('/s/ABCD');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toMatch(/\/tools\/scoreboard\/ABCD\/remote/);
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
  });

  test('an invalid /s/<code> 404s rather than redirecting', async ({ page }) => {
    // 'zz' is not a valid room code (too short + lowercase) → notFound().
    const res = await page.goto('/s/zz');
    expect(res?.status(), 'invalid short-code should 404').toBe(404);
    expect(page.url()).not.toMatch(/\/tools\/scoreboard\/[A-Z0-9]{4}\/remote/);
  });
});
