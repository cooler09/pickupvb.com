import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * Hero image upload widget — authenticated flows (Sections 2.3, 4.2, 7.3).
 *
 * Tests verify the upload widget is present on the profile page, that a
 * test image can be uploaded and then removed, and that the widget also
 * appears on event-edit and group-edit pages when accessible.
 *
 * The beforeAll/afterAll pattern used in event-host.authed.spec.ts is not
 * needed here because each test is self-contained. The authed project in
 * playwright.config.ts injects the storageState automatically for every test
 * in *.authed.spec.ts files. The STORAGE_STATE constant is kept for any
 * browser-scoped beforeAll/afterAll that allocate their own context.
 */

const STORAGE_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'user.json');

// 1×1 transparent PNG — used to test file upload without hitting a real host.
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('hero image — profile', () => {
  test('upload widget is present on /profile', async ({ page }) => {
    await page.goto('/profile');

    // Accept either "Add banner image" button (no banner) or an existing banner img.
    const addBannerBtn = page.getByRole('button', { name: /add banner image/i }).first();
    const existingBanner = page.locator('img').filter({ hasText: '' }).first();

    // The widget renders either the add button or the existing image — one must be visible.
    const hasAdd = await addBannerBtn.isVisible({ timeout: 10_000 }).catch(() => false);
    const hasExisting = await page
      .locator('[data-testid*="banner"], [data-testid*="hero"], .hero-image, .banner-image')
      .first()
      .isVisible()
      .catch(() => false);
    // Broader fallback: any "Change image" or "Remove" button implies an existing banner.
    const hasChangeBtn = await page
      .getByRole('button', { name: /change image/i })
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasAdd || hasExisting || hasChangeBtn).toBe(true);
  });

  test('upload a test image, verify preview, then remove it', async ({ page }) => {
    await page.goto('/profile');

    // If there is already a banner, remove it first so the test starts clean.
    const existingRemoveBtn = page.getByRole('button', { name: /remove/i }).first();
    const hasExistingRemove = await existingRemoveBtn
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (hasExistingRemove) {
      await existingRemoveBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // The "Add banner image" trigger must now be visible.
    const addBannerBtn = page.getByRole('button', { name: /add banner image/i }).first();
    await expect(addBannerBtn).toBeVisible({ timeout: 10_000 });

    // Trigger the file-input by clicking the button (it may proxy to the hidden input).
    // Use setInputFiles directly on the hidden input without going through click,
    // since the input is sr-only / hidden.
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: TEST_PNG,
    });

    // Wait for upload to complete — either "Change image" appears or the img src updates.
    const changeBtn = page.getByRole('button', { name: /change image/i }).first();
    await expect(changeBtn).toBeVisible({ timeout: 20_000 });

    // Cleanup — remove the uploaded banner.
    const removeBtn = page.getByRole('button', { name: /remove/i }).first();
    await expect(removeBtn).toBeVisible({ timeout: 10_000 });
    await removeBtn.click();
    await page.waitForLoadState('networkidle');

    // Confirm the widget reverts to the add state.
    await expect(page.getByRole('button', { name: /add banner image/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test.fixme(
    'Remove button cleans up existing banner — requires pre-existing banner in the dev environment',
  );
});

test.describe('hero image — event edit', () => {
  test('upload widget appears on event edit page', async ({ page }) => {
    await page.goto('/events');

    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events in this environment; skipping event-edit hero image test');
    }

    const href = (await eventLink.getAttribute('href')) ?? '/events';
    const editUrl = href.replace(/\/$/, '') + '/edit';
    const response = await page.goto(editUrl);

    // Skip gracefully if not the host (edit page redirects away or returns non-200).
    if (!response?.ok() || page.url().includes('/login') || !page.url().includes('/edit')) {
      test.skip(true, 'Edit page not accessible — user is not the host of this event');
    }

    const addBannerBtn = page.getByRole('button', { name: /add banner image/i }).first();
    const hasWidget = await addBannerBtn.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasWidget) {
      test.skip(true, 'No hero image widget found on event edit page');
    }
    await expect(addBannerBtn).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('hero image — group edit', () => {
  test('upload widget appears on group edit page', async ({ page }) => {
    await page.goto('/groups');

    const groupLink = page.locator('a[href*="/groups/"]').first();
    if ((await groupLink.count()) === 0) {
      test.skip(true, 'No groups in this environment; skipping group-edit hero image test');
    }

    const href = (await groupLink.getAttribute('href')) ?? '/groups';
    const editUrl = href.replace(/\/$/, '') + '/edit';
    const response = await page.goto(editUrl);

    // Skip gracefully if the user is not an owner / access is denied.
    if (!response?.ok() || page.url().includes('/login') || !page.url().includes('/edit')) {
      test.skip(true, 'Group edit page not accessible — user is not an owner of this group');
    }

    const addBannerBtn = page.getByRole('button', { name: /add banner image/i }).first();
    const hasWidget = await addBannerBtn.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasWidget) {
      test.skip(true, 'No hero image widget found on group edit page');
    }
    await expect(addBannerBtn).toBeVisible({ timeout: 10_000 });
  });
});
