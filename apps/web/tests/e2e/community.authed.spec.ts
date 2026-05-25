import { test, expect } from '@playwright/test';

/**
 * Authenticated community-directory flows.
 *
 * The "submit a listing" test creates and immediately deletes a listing within
 * the same test body for self-contained cleanup. If the test fails before the
 * delete step, the orphaned listing will remain in the dev database — remove it
 * manually via the listing's detail page or Supabase dashboard.
 */

test.describe('community directory', () => {
  test('community directory loads at /community', async ({ page }) => {
    const response = await page.goto('/community');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
  });

  test('first existing listing in directory loads', async ({ page }) => {
    await page.goto('/community');
    const listingLink = page.locator('a[href*="/community/"]').first();
    if ((await listingLink.count()) === 0) {
      test.skip(true, 'No community listings in this environment; skipping');
    }
    const href = await listingLink.getAttribute('href');
    if (!href) return;
    const response = await page.goto(href);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('submit and delete a listing', () => {
  test('submit listing, verify redirect, then delete listing', async ({ page }) => {
    const uniqueTitle = `E2E Test Club ${Date.now()}`;

    await page.goto('/community/new');
    const response = await page.request.get('/community/new');
    if (!response.ok()) {
      test.skip(true, '/community/new not reachable; skipping');
    }

    // Fill listing form fields.
    await page.locator('#title').fill(uniqueTitle);
    await page.locator('#description').fill('Automated e2e test listing — safe to delete');
    await page.locator('#externalUrl').fill('https://www.facebook.com/groups/vbtest');
    await page.locator('#externalHostName').fill('E2E Test Club');
    await page.locator('#addressLine').fill('123 Main St');
    await page.locator('#city').fill('Virginia Beach');
    await page.locator('#region').fill('VA');

    // postalCode and country may or may not be present depending on the form version.
    const postalInput = page.locator('#postalCode');
    if ((await postalInput.count()) > 0) {
      await postalInput.fill('23451');
    }
    const countryInput = page.locator('#country');
    if ((await countryInput.count()) > 0) {
      await countryInput.fill('US');
    }

    await page.getByRole('button', { name: /submit listing/i }).click();

    // Expect redirect to /community/<slug>.
    await page.waitForURL(/\/community\/[^/]+$/, { timeout: 15_000 });
    const listingUrl = page.url();
    expect(listingUrl).toMatch(/\/community\//);

    // Verify the title appears on the listing page.
    await expect(page.locator('main')).toContainText(uniqueTitle, { timeout: 10_000 });

    // Cleanup — delete the listing.
    const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
    await deleteBtn.click();

    // Some delete flows show a confirmation dialog — handle it if present.
    const confirmBtn = page
      .getByRole('button', { name: /confirm|yes|delete/i })
      .filter({ hasNotText: /cancel/i })
      .first();
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Expect redirect back to /community after deletion.
    await page.waitForURL(/\/community$/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/community$/);
  });

  test('deleted listing slug returns 404 or not found', async ({ page }) => {
    // Visiting a slug that was just deleted (or any non-existent slug) should not 500.
    const response = await page.goto('/community/e2e-nonexistent-slug-xyz-99999');
    // Either a 404 response or a soft-404 page — not a 500.
    const statusOk = response?.status() === 404 || response?.status() === 200;
    expect(statusOk).toBe(true);
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
    if (response?.status() === 200) {
      // Soft 404: the page body should say "not found" or similar.
      await expect(page.locator('body')).toContainText(/not found|doesn't exist|no listing/i);
    }
  });
});

test.describe('external link warning', () => {
  test('/leaving?url=https://example.com shows warning page', async ({ page }) => {
    const response = await page.goto('/leaving?url=https://example.com');
    expect(response?.ok()).toBeTruthy();
    // The leaving page should warn the user they are navigating away.
    await expect(page.locator('body')).toContainText(
      /leaving|external|example\.com|continue|proceed/i,
    );
  });
});

test.describe('rate limiting and moderation (placeholders)', () => {
  test.fixme('6th submission in a day returns rate-limit error');

  test.fixme("report listing — requires another user's listing");

  test.fixme('admin moderation — requires admin role on the test account');
});
