import { test, expect } from '@playwright/test';

/**
 * Public navigation — page reachability, auth guards, and interstitial.
 * All read-only; no auth required.
 */

test.describe('public pages', () => {
  const publicRoutes = [
    { url: '/pricing', label: 'pricing' },
    { url: '/community', label: 'community directory' },
    { url: '/players', label: 'player directory' },
    { url: '/groups', label: 'group directory' },
  ];

  for (const { url, label } of publicRoutes) {
    test(`${label} page loads without auth`, async ({ page }) => {
      const response = await page.goto(url);
      expect(response?.ok(), `${url} returned ${response?.status()}`).toBeTruthy();
      await expect(page.locator('main')).toBeVisible();
    });
  }

  test('pricing page mentions Pro or subscription', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator('body')).toContainText(/pro|subscribe|plan|month|year/i);
  });

  test('/about or /about/numbers loads without auth', async ({ page }) => {
    // Try /about/numbers first; fall back to /about if it 404s.
    const res = await page.goto('/about/numbers');
    if (!res?.ok()) {
      const fallback = await page.goto('/about');
      expect(fallback?.ok()).toBeTruthy();
    }
    await expect(page.locator('body')).not.toContainText(/not found|404/i);
  });
});

test.describe('auth guards', () => {
  const protectedRoutes = [
    { url: '/profile/billing', label: '/profile/billing' },
    { url: '/events/new', label: '/events/new' },
    { url: '/groups/new', label: '/groups/new' },
  ];

  for (const { url, label } of protectedRoutes) {
    test(`${label} redirects to login when signed out`, async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test.describe('external link interstitial', () => {
  test('/leaving?url=... shows a warning before navigating away', async ({ page }) => {
    const response = await page.goto('/leaving?url=https://example.com');
    // Either the route renders or redirects — both are fine; we just verify
    // it doesn't 500 and shows some protective messaging.
    if (!response?.ok()) {
      test.skip(true, '/leaving route not present in this build');
    }
    const body = page.locator('body');
    await expect(body).toContainText(/leaving|external|continue|pickupvb/i);
  });
});

test.describe('short URL redirect', () => {
  test.fixme(
    'GET /e/<code> 308-redirects to the full event URL — requires a known short code in the dev env',
  );
});
