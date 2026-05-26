import { test, expect } from '@playwright/test';

/**
 * Group directory and public group profiles.
 * All read-only; no auth required.
 */

test.describe('group directory', () => {
  test('loads without auth', async ({ page }) => {
    const response = await page.goto('/groups');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible();
  });

  test('has a search input or browse capability', async ({ page }) => {
    await page.goto('/groups');
    // Either a search input or some group listing.
    const search = page
      .getByRole('searchbox')
      .or(page.locator('input[type="search"]'))
      .or(page.getByPlaceholder(/search|group/i))
      .first();
    const hasSearch = (await search.count()) > 0;
    const hasListing = (await page.locator('main').textContent()) ?? '';
    // Either a search box exists OR there's substantive page content.
    if (!hasSearch) {
      expect(hasListing.trim().length).toBeGreaterThan(20);
    }
  });

  test('search for a non-existent group shows empty state, not a crash', async ({ page }) => {
    await page.goto('/groups?q=zzz-no-such-group-xyz-e2e');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/500|internal server error|unhandled/i);
  });

  test('group profile page loads for first result in directory', async ({ page }) => {
    await page.goto('/groups');
    const groupLink = page.locator('a[href*="/groups/"]').first();
    const count = await groupLink.count();
    if (count === 0) {
      test.skip(true, 'No groups in this environment; skipping profile load test');
    }
    const href = await groupLink.getAttribute('href');
    if (!href) return;
    const response = await page.goto(href);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible();
    // Group profile should show a name or description.
    const text = (await page.locator('main').textContent()) ?? '';
    expect(text.trim().length).toBeGreaterThan(10);
  });
});
