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

    // Fill listing form fields. Location is optional — skip it to avoid
    // triggering the Nominatim geocoding API which can fail on generic test addresses.
    await page.locator('#title').fill(uniqueTitle);
    await page.locator('#description').fill('Automated e2e test listing — safe to delete');
    await page.locator('#externalUrl').fill('https://www.facebook.com/groups/vbtest');
    await page.locator('#externalHostName').fill('E2E Test Club');

    // Set the required "Starts" date via the hidden input that DateTimePicker
    // uses for form submission — avoids fighting the calendar popover UI.
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await page.locator('input[name="startsAt"]').evaluate((el: HTMLInputElement, val: string) => {
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, futureDate);

    await page.getByRole('button', { name: /submit listing/i }).click();

    // Wait for navigation away from /community/new to a slug page.
    // The simple regex /\/community\/[^/]+$/ also matches /community/new itself,
    // so use a predicate that explicitly excludes it.
    await page.waitForURL(
      (url) => /\/community\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
      { timeout: 15_000 },
    );
    const listingUrl = page.url();
    expect(listingUrl).toMatch(/\/community\//);

    // Verify the title appears on the listing page.
    await expect(page.locator('main')).toContainText(uniqueTitle, { timeout: 10_000 });

    // Cleanup — delete the listing.
    // The delete UI requires checking a "Confirm" checkbox before the button
    // becomes active — check it first if present.
    const confirmCheckbox = page.getByRole('checkbox', { name: /confirm/i }).first();
    if ((await confirmCheckbox.count()) > 0) {
      await confirmCheckbox.check();
    }
    const deleteBtn = page.getByRole('button', { name: /^delete$/i }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
    await deleteBtn.click();

    // Expect redirect back to /community after deletion (may include a ?notice= query param).
    await page.waitForURL((url) => url.pathname === '/community', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/community');
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
  test.fixme('6th submission in a day returns rate-limit error', async () => {});

  test.fixme("report listing — requires another user's listing", async () => {});

  test.fixme('admin moderation — requires admin role on the test account', async () => {});
});
