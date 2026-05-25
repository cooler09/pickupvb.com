import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * Group management flows (Sections 7.2–7.6 of the test plan).
 *
 * Requires the test user to own at least one group (created via groups.authed.spec.ts
 * @destructive test or manually). Tests that cannot find an owned group skip gracefully.
 *
 * Section 7.5 (Follow/Unfollow group) is covered in groups.authed.spec.ts.
 * This file covers: 7.2 (group edit), 7.3 (hero image on group), 7.4 (members — fixme),
 * 7.6 (host event as group — fixme).
 */

const STORAGE_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'user.json');

/**
 * Finds an owned group by navigating to /profile and following any group admin link.
 * Returns the group URL or null.
 */
async function findOwnedGroupUrl(page: import('@playwright/test').Page): Promise<string | null> {
  await page.goto('/profile');
  await page.waitForLoadState('networkidle');

  // Look for links in the groups section — owned groups often have edit/admin links.
  const groupLinks = page.locator('a[href*="/groups/"]');
  const count = await groupLinks.count();
  for (let i = 0; i < count; i++) {
    const href = await groupLinks.nth(i).getAttribute('href');
    if (!href || href.includes('/edit') || href.includes('/members') || href.includes('/new'))
      continue;
    return href;
  }

  return null;
}

test.describe('group edit', () => {
  test('group edit page loads if user owns a group', async ({ page }) => {
    const groupUrl = await findOwnedGroupUrl(page);
    if (!groupUrl) {
      test.skip(true, 'Test user does not own a group; skipping group edit test');
    }

    const editUrl = `${groupUrl.replace(/\/$/, '')}/edit`;
    const response = await page.goto(editUrl);

    if (
      !response?.ok() ||
      page.url().includes('/login') ||
      (page.url().includes('/groups') && !page.url().includes('/edit'))
    ) {
      test.skip(true, 'Test user is not the owner of this group; edit page redirected');
    }

    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    // Edit form should have a description or name field.
    const hasForm = await page
      .locator('textarea, input[name="description"], input[name="name"]')
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(hasForm).toBe(true);
  });

  test('owner can edit group description and changes persist', async ({ page }) => {
    const groupUrl = await findOwnedGroupUrl(page);
    if (!groupUrl) {
      test.skip(true, 'Test user does not own a group; skipping');
    }

    const editUrl = `${groupUrl.replace(/\/$/, '')}/edit`;
    await page.goto(editUrl);

    if (!page.url().includes('/edit')) {
      test.skip(true, 'Test user cannot access this group edit page; skipping');
    }

    const descInput = page
      .locator('textarea[name="description"]')
      .or(page.locator('textarea').first())
      .first();

    if ((await descInput.count()) === 0) {
      test.skip(true, 'No description textarea found on group edit page; skipping');
    }

    const originalDesc = (await descInput.inputValue()) ?? '';
    const newDesc = `E2E test description ${Date.now()}`;

    await descInput.fill(newDesc);
    await page
      .getByRole('button', { name: /save|update|submit/i })
      .first()
      .click();
    await page.waitForLoadState('networkidle');

    // Navigate to group profile and verify updated description.
    await page.goto(groupUrl);
    await expect(page.locator('main')).toContainText(newDesc, { timeout: 10_000 });

    // Cleanup — restore original description.
    await page.goto(editUrl);
    const descInputAgain = page.locator('textarea').first();
    await descInputAgain.fill(originalDesc);
    await page
      .getByRole('button', { name: /save|update|submit/i })
      .first()
      .click();
    await page.waitForLoadState('networkidle');
  });
});

test.describe('hero image on group', () => {
  const TEST_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );

  test('hero image upload widget is present on group edit page', async ({ page }) => {
    const groupUrl = await findOwnedGroupUrl(page);
    if (!groupUrl) {
      test.skip(true, 'Test user does not own a group; skipping hero image test');
    }

    const editUrl = `${groupUrl.replace(/\/$/, '')}/edit`;
    await page.goto(editUrl);

    if (!page.url().includes('/edit')) {
      test.skip(true, 'Cannot access group edit page; skipping');
    }

    // Hero image widget may be a button or an input.
    const heroWidget = page
      .getByRole('button', { name: /add banner|change image|hero image/i })
      .or(page.locator('input[type="file"][accept*="image"]'))
      .first();

    await expect(heroWidget).toBeVisible({ timeout: 10_000 });
  });

  test('upload a hero image to group edit page, then remove', async ({ page }) => {
    const groupUrl = await findOwnedGroupUrl(page);
    if (!groupUrl) {
      test.skip(true, 'Test user does not own a group; skipping');
    }

    const editUrl = `${groupUrl.replace(/\/$/, '')}/edit`;
    await page.goto(editUrl);

    if (!page.url().includes('/edit')) {
      test.skip(true, 'Cannot access group edit page; skipping');
    }

    // Trigger the file input.
    const addBannerBtn = page.getByRole('button', { name: /add banner|change image/i }).first();
    if ((await addBannerBtn.count()) > 0) {
      await addBannerBtn.click();
    }

    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    if ((await fileInput.count()) === 0) {
      test.skip(true, 'No file input found on group edit page; skipping');
    }

    await fileInput.setInputFiles({
      name: 'test-banner.png',
      mimeType: 'image/png',
      buffer: TEST_PNG,
    });

    // Wait for upload to complete.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    // Verify preview or success indicator.
    const hasPreview = await page
      .locator('img[src*="supabase"], img[src*="blob:"], [data-testid="hero-preview"]')
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    const hasSuccess = await page
      .getByText(/uploaded|saved|image set/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    const hasRemoveBtn = await page
      .getByRole('button', { name: /remove|delete/i })
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    expect(hasPreview || hasSuccess || hasRemoveBtn).toBe(true);

    // Cleanup — remove the image.
    const removeBtn = page.getByRole('button', { name: /remove/i }).first();
    if ((await removeBtn.count()) > 0) {
      await removeBtn.click();
      await page.waitForLoadState('networkidle');
    }
  });
});

test.describe('group members', () => {
  test.fixme('owner can add a member by handle — use attendee-b (TEST_ATTENDEE_B_EMAIL)');

  test.fixme('owner can promote a member to admin — use attendee-b (TEST_ATTENDEE_B_EMAIL)');

  test.fixme('owner can remove a member — use attendee-b (TEST_ATTENDEE_B_EMAIL)');

  test.fixme('non-member is redirected from /groups/<slug>/members');
});

test.describe('host event as group', () => {
  test.fixme(
    'group owner creates event selecting the group as host — event appears in group upcoming events list',
  );
});
