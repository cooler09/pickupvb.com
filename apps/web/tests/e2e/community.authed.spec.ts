import { test, expect } from './_helpers/fixtures';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';

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
    // Match HTTP 500 contexts only — bare /500/ matches arbitrary digit runs
    // in listing titles (e.g. "Admin Mod Test 1779750066869" contains "500").
    await expect(page.locator('body')).not.toContainText(
      /\b(?:HTTP\s*)?500\b|internal server error/i,
    );
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
    await expect(page.locator('body')).not.toContainText(
      /\b(?:HTTP\s*)?500\b|internal server error/i,
    );
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

  test('report listing — attendee-b submits a listing, attendee-a reports it, success notice shown', async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);

    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');

    // attendee-b creates a throwaway listing.
    const bCtx = await browser.newContext({ storageState: STORAGE_PATHS.attendeeB });
    const bPage = await bCtx.newPage();
    let listingUrl: string | null = null;

    try {
      const listingTitle = `E2E Report Test ${Date.now()}`;
      await bPage.goto('/community/new');

      const creationResp = await bPage.request.get('/community/new');
      if (!creationResp.ok()) {
        test.skip(true, '/community/new not reachable for attendee-b; skipping');
      }

      await bPage.locator('#title').fill(listingTitle);
      await bPage.locator('#description').fill('E2E report test listing — safe to delete');
      await bPage.locator('#externalUrl').fill('https://www.facebook.com/groups/vbtest');
      await bPage.locator('#externalHostName').fill('E2E Report Test Club');

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await bPage
        .locator('input[name="startsAt"]')
        .evaluate((el: HTMLInputElement, val: string) => {
          el.value = val;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, futureDate);

      await bPage.getByRole('button', { name: /submit listing/i }).click();
      await bPage.waitForURL(
        (url) => /\/community\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
        { timeout: 15_000 },
      );
      listingUrl = bPage.url();

      // attendee-a (main page fixture) navigates to the listing and reports it.
      await page.goto(listingUrl);
      await page.waitForLoadState('domcontentloaded');

      // "See a problem?" section with a reason select + "Report listing" button.
      const reasonSelect = page.locator('select[name="reason"]').first();
      await expect(reasonSelect).toBeVisible({ timeout: 10_000 });
      await reasonSelect.selectOption('spam');

      const reportBtn = page.getByRole('button', { name: /report listing/i }).first();
      await expect(reportBtn).toBeVisible({ timeout: 5_000 });
      await reportBtn.click();

      // Server redirects back to the listing with ?notice=reported.
      await page.waitForURL((url) => url.searchParams.get('notice') === 'reported', {
        timeout: 10_000,
      });
      // Scope to main — the dev-environment banner at page top also carries
      // role="status" and would cause a strict-mode violation on the full document.
      await expect(page.locator('main [role="status"]')).toContainText(/report.*recorded|thank/i, {
        timeout: 10_000,
      });
    } finally {
      // Cleanup — attendee-b deletes the listing.
      if (listingUrl) {
        await bPage.goto(listingUrl);
        await bPage.waitForLoadState('domcontentloaded');
        const confirmCheckbox = bPage.getByRole('checkbox', { name: /confirm/i }).first();
        if ((await confirmCheckbox.count()) > 0) await confirmCheckbox.check();
        const deleteBtn = bPage.getByRole('button', { name: /^delete$/i }).first();
        if ((await deleteBtn.count()) > 0) {
          await deleteBtn.click();
          await bPage.waitForLoadState('domcontentloaded');
        }
      }
      await bCtx.close();
    }
  });

  // "admin moderation" is covered by admin.authed.spec.ts:
  //   "admin hides a listing → hidden from public directory → admin can still see it; then unhides → listing restored".
});
