import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

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
const ATTENDEE_B_STATE = path.join(
  __dirname,
  '..',
  '..',
  '.playwright',
  '.auth',
  'attendee-b.json',
);

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
  test('owner can add attendee-b, promote to admin, then remove', async ({ page, browser }) => {
    test.setTimeout(60_000);

    if (!fs.existsSync(ATTENDEE_B_STATE)) {
      test.skip(true, 'attendee-b auth not set up (TEST_ATTENDEE_B_EMAIL missing); skipping');
    }

    const groupUrl = await findOwnedGroupUrl(page);
    if (!groupUrl) {
      test.skip(true, 'Test user does not own a group; skipping');
    }

    // Get attendee-b's display name for the UserPicker search.
    const bContext = await browser.newContext({ storageState: ATTENDEE_B_STATE });
    const bPage = await bContext.newPage();
    let bDisplayName: string | null = null;
    let bHandle: string | null = null;
    try {
      await bPage.goto('/profile');
      await bPage.waitForLoadState('networkidle');
      const dnInput = bPage.locator('input[name="display_name"]').first();
      bDisplayName = (await dnInput.count()) > 0 ? await dnInput.inputValue() : null;
      const hInput = bPage.locator('input[name="handle"]').first();
      bHandle = (await hInput.count()) > 0 ? await hInput.inputValue() : null;
    } finally {
      await bContext.close();
    }

    const searchTerm = bDisplayName || bHandle;
    if (!searchTerm) {
      test.skip(true, 'Could not determine attendee-b display name or handle; skipping');
    }

    const membersUrl = `${groupUrl.replace(/\/$/, '')}/members`;
    await page.goto(membersUrl);
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/members')) {
      test.skip(true, 'Cannot access group members page; skipping');
    }

    // Use the UserPicker to search for attendee-b.
    const combobox = page.getByRole('combobox').first();
    if ((await combobox.count()) === 0) {
      test.skip(true, 'No UserPicker combobox found on members page; skipping');
    }
    await combobox.fill(searchTerm!);
    await page.waitForLoadState('networkidle');

    // Wait for the listbox to appear and click the matching option.
    const listbox = page.getByRole('listbox').first();
    await expect(listbox).toBeVisible({ timeout: 10_000 });
    const option = listbox.getByRole('option').first();
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();

    // Submit "Add member".
    const addBtn = page.getByRole('button', { name: /add member/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
    await addBtn.click();
    await page.waitForLoadState('networkidle');

    // Attendee-b should now appear in the member list.
    await expect(page.locator('main')).toContainText(searchTerm!, { timeout: 10_000 });

    // Find attendee-b's row and promote to admin.
    const memberRow = page.locator('li, tr').filter({ hasText: searchTerm! }).first();
    const promoteBtn = memberRow
      .getByRole('button', { name: /→\s*admin/i })
      .or(memberRow.getByRole('button', { name: /make admin|promote/i }))
      .first();
    if ((await promoteBtn.count()) > 0) {
      await promoteBtn.click();
      await page.waitForLoadState('networkidle');
      // Verify role changed.
      await expect(page.locator('main')).toContainText(/admin/i, { timeout: 10_000 });
    }

    // Remove attendee-b from the group.
    const updatedRow = page.locator('li, tr').filter({ hasText: searchTerm! }).first();
    const removeBtn = updatedRow.getByRole('button', { name: /remove/i }).first();
    await expect(removeBtn).toBeVisible({ timeout: 10_000 });
    await removeBtn.click();
    await page.waitForLoadState('networkidle');

    // Member should no longer appear in the Current members list.
    // The UserPicker preview pane retains the search term in the DOM after removal —
    // scope to the members list (last <ul> in main) to avoid a false failure.
    await expect(page.locator('main').getByRole('list').last()).not.toContainText(searchTerm!, {
      timeout: 10_000,
    });
  });

  test('non-member is redirected from /groups/<slug>/members', async ({ page }) => {
    // Start from the groups directory and find a group the test user did not create.
    // Owned groups appear in /profile; any group NOT linked there is likely non-member.
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const profileGroupHrefs = new Set<string>();
    const profileLinks = page.locator('a[href*="/groups/"]');
    const profileCount = await profileLinks.count();
    for (let i = 0; i < profileCount; i++) {
      const href = await profileLinks.nth(i).getAttribute('href');
      if (href) profileGroupHrefs.add(href);
    }

    await page.goto('/groups');
    await page.waitForLoadState('networkidle');

    const groupLinks = page.locator('a[href*="/groups/"]');
    const count = await groupLinks.count();
    if (count === 0) {
      test.skip(true, 'No groups in this environment; skipping non-member redirect test');
    }

    for (let i = 0; i < Math.min(count, 8); i++) {
      const href = await groupLinks.nth(i).getAttribute('href');
      if (!href || href.includes('/edit') || href.includes('/members') || href.includes('/new'))
        continue;
      if (profileGroupHrefs.has(href)) continue; // likely owned/member

      const slug = href.split('/groups/')[1]?.replace(/\/$/, '');
      if (!slug) continue;

      await page.goto(`/groups/${slug}/members`);
      await page.waitForLoadState('networkidle');

      const finalUrl = page.url();
      if (!finalUrl.includes('/members')) {
        // Redirected — access guard is working.
        const safe =
          finalUrl.includes('/login') ||
          finalUrl.includes(`/groups/${slug}`) ||
          finalUrl === new URL('/', finalUrl).href;
        expect(safe).toBe(true);
        return;
      }

      // Members page loaded — may be a member; try another group.
      await page.goto('/groups');
      await page.waitForLoadState('networkidle');
    }

    test.skip(true, 'Could not find a group the test user is not a member of; skipping');
  });
});

test.describe('host event as group', () => {
  test.fixme(
    'group owner creates event selecting the group as host — event appears in group upcoming events list',
  );
});
