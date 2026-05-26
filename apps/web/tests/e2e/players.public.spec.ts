import { test, expect } from '@playwright/test';

/**
 * Player directory and public profiles.
 * All read-only; no auth required.
 */

test.describe('player directory', () => {
  test('loads without auth', async ({ page }) => {
    const response = await page.goto('/players');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible();
  });

  test('has a search input', async ({ page }) => {
    await page.goto('/players');
    const search = page
      .getByRole('searchbox')
      .or(page.locator('input[type="search"]'))
      .or(page.getByPlaceholder(/search|player|handle/i))
      .first();
    await expect(search).toBeVisible();
  });

  test('search for a non-existent handle shows empty state, not a crash', async ({ page }) => {
    await page.goto('/players?q=zzz-no-such-player-xyz-e2e');
    await expect(page.locator('main')).toBeVisible();
    // Either 0 results or an empty-state message — no unhandled error.
    const body = page.locator('body');
    await expect(body).not.toContainText(/500|internal server error|unhandled/i);
  });

  test('public player profile loads for first result in directory', async ({ page }) => {
    await page.goto('/players');
    // Find the first player card / link and navigate to it.
    const playerLink = page.locator('a[href*="/players/"]').first();
    const count = await playerLink.count();
    if (count === 0) {
      test.skip(true, 'No players in this environment; skipping profile load test');
    }
    const href = await playerLink.getAttribute('href');
    if (!href) return;
    const response = await page.goto(href);
    expect(response?.ok()).toBeTruthy();
    // Profile should show a display name or handle, not private data (email).
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/@.*\.com/); // no raw email
  });
});
