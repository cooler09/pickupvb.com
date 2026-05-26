import { test, expect } from '@playwright/test';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';

/**
 * Admin / platform moderation flows (Section 17 of the test plan).
 *
 * All tests open a browser context signed in as TEST_ADMIN_EMAIL (admin.json).
 * They skip gracefully if that setup file is absent.
 *
 * The hide/unhide test uses attendee-b to create and later delete a throwaway
 * community listing so the admin has something to act on. It also skips if
 * attendee-b auth is absent.
 */

test.describe('admin profile', () => {
  test('admin badge is visible next to display name on /profile', async ({ browser }) => {
    skipIfMissingAuth(STORAGE_PATHS.admin, 'admin');

    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.admin });
    const page = await ctx.newPage();
    try {
      await page.goto('/profile');
      await page.waitForLoadState('domcontentloaded');

      // AdminBadge renders as:
      // <span aria-label="Platform admin — moderator and PickupVB staff">Admin</span>
      const badge = page.locator('[aria-label*="Platform admin"]').first();
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText('Admin');
    } finally {
      await ctx.close();
    }
  });
});

test.describe('community listing moderation', () => {
  test('admin hides a listing → hidden from public directory → admin can still see it; then unhides → listing restored', async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    skipIfMissingAuth(STORAGE_PATHS.admin, 'admin');
    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');

    // Attendee-b creates a throwaway community listing.
    const bCtx = await browser.newContext({ storageState: STORAGE_PATHS.attendeeB });
    const bPage = await bCtx.newPage();
    let listingUrl: string | null = null;
    try {
      const listingTitle = `Admin Mod Test ${Date.now()}`;
      await bPage.goto('/community/new');
      if (bPage.url().includes('/login') || !(await bPage.request.get('/community/new')).ok()) {
        test.skip(true, '/community/new not reachable for attendee-b; skipping');
      }

      await bPage.locator('#title').fill(listingTitle);
      await bPage.locator('#description').fill('E2E admin moderation test — safe to delete');
      await bPage.locator('#externalUrl').fill('https://www.facebook.com/groups/vbtest');
      await bPage.locator('#externalHostName').fill('E2E Admin Test Club');

      // Set startsAt via direct input evaluation (avoids DateTimePicker UI).
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
      expect(listingUrl).toMatch(/\/community\//);

      // ── Admin hides the listing ──────────────────────────────────────
      const adminCtx = await browser.newContext({ storageState: STORAGE_PATHS.admin });
      const adminPage = await adminCtx.newPage();
      try {
        await adminPage.goto(listingUrl);
        await adminPage.waitForLoadState('domcontentloaded');

        // Admin sees a "Manage listing" section with a "Hide" button.
        const hideBtn = adminPage.getByRole('button', { name: /^hide$/i }).first();
        await expect(hideBtn).toBeVisible({ timeout: 10_000 });
        await hideBtn.click();
        await adminPage.waitForLoadState('domcontentloaded');

        // Page should show a success notice for "hidden".
        await expect(adminPage.locator('body')).toContainText(/hidden|only you|platform admin/i, {
          timeout: 10_000,
        });

        // Public user (fresh unauthenticated check via /community directory) should not see it.
        // We use a second public context to avoid leaking admin cookies.
        const publicCtx = await browser.newContext();
        const publicPage = await publicCtx.newPage();
        try {
          await publicPage.goto('/community');
          await publicPage.waitForLoadState('domcontentloaded');
          // The listing title should no longer appear in the directory.
          const titleVisible = await publicPage
            .getByText(new RegExp(listingTitle, 'i'))
            .first()
            .isVisible({ timeout: 5_000 })
            .catch(() => false);
          expect(titleVisible, 'Hidden listing must not appear in public /community').toBe(false);
        } finally {
          await publicCtx.close();
        }

        // Admin CAN still see the listing directly via its URL.
        await adminPage.goto(listingUrl);
        await adminPage.waitForLoadState('domcontentloaded');
        await expect(adminPage.locator('main')).toContainText(/hidden|removed|not visible/i, {
          timeout: 10_000,
        });

        // ── Admin unhides the listing ────────────────────────────────
        const unhideBtn = adminPage.getByRole('button', { name: /^unhide$/i }).first();
        await expect(unhideBtn).toBeVisible({ timeout: 10_000 });
        await unhideBtn.click();
        await adminPage.waitForLoadState('domcontentloaded');

        // Success notice for "unhidden" / "restored".
        await expect(adminPage.locator('body')).toContainText(/restored|unhidden|active/i, {
          timeout: 10_000,
        });
      } finally {
        await adminCtx.close();
      }
    } finally {
      // Cleanup: attendee-b deletes the listing.
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
});

test.describe('listing claim moderation', () => {
  test.fixme('non-owner claims a listing → admin approves the claim → claimant gains edit/delete permissions', async () => {});
});
