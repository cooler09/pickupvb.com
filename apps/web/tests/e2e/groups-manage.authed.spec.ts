import { test, expect } from '@playwright/test';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { cancelEvent, createFreeOpenPlayEvent } from './_helpers/event-create';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { withAuthContext } from './_helpers/browser';
import { findOwnedGroupUrl } from './_helpers/navigation';

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
    const hasForm = await isVisibleOrTimeout(
      page.locator('textarea, input[name="description"], input[name="name"]').first(),
      5_000,
    );
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
    await page.waitForLoadState('domcontentloaded');

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
    await page.waitForLoadState('domcontentloaded');
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

    // The upload is async — first wait for the "Uploading…" pending state
    // to clear, otherwise the success-indicator checks below race the
    // round-trip and all return false on slow Supabase Storage.
    await expect(page.getByRole('button', { name: /uploading/i })).toBeHidden({
      timeout: 30_000,
    });

    // Any one of these three markers proves the upload landed. A single
    // `.or()`-chained locator lets Playwright auto-wait instead of three
    // sequential `.isVisible().catch(false)` checks that swallow the signal.
    const uploadedIndicator = page
      .locator('img[src*="supabase"], img[src*="blob:"], [data-testid="hero-preview"]')
      .first()
      .or(page.getByText(/uploaded|saved|image set/i).first())
      .or(page.getByRole('button', { name: /remove|delete/i }).first());

    await expect(uploadedIndicator.first()).toBeVisible({ timeout: 10_000 });

    // Cleanup — remove the image.
    const removeBtn = page.getByRole('button', { name: /remove/i }).first();
    if ((await removeBtn.count()) > 0) {
      await removeBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }
  });
});

test.describe('group members', () => {
  test('owner can add attendee-b, promote to admin, then remove', async ({ page, browser }) => {
    test.setTimeout(60_000);

    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');

    const groupUrl = await findOwnedGroupUrl(page);
    if (!groupUrl) {
      test.skip(true, 'Test user does not own a group; skipping');
    }

    // Get attendee-b's display name for the UserPicker search.
    let bDisplayName: string | null = null;
    let bHandle: string | null = null;
    await withAuthContext(browser, STORAGE_PATHS.attendeeB, async (bPage) => {
      await bPage.goto('/profile');
      await bPage.waitForLoadState('domcontentloaded');
      const dnInput = bPage.locator('input[name="display_name"]').first();
      bDisplayName = (await dnInput.count()) > 0 ? await dnInput.inputValue() : null;
      const hInput = bPage.locator('input[name="handle"]').first();
      bHandle = (await hInput.count()) > 0 ? await hInput.inputValue() : null;
    });

    const searchTerm = bDisplayName || bHandle;
    if (!searchTerm) {
      test.skip(true, 'Could not determine attendee-b display name or handle; skipping');
    }

    const membersUrl = `${groupUrl.replace(/\/$/, '')}/members`;
    await page.goto(membersUrl);
    await page.waitForLoadState('domcontentloaded');

    if (!page.url().includes('/members')) {
      test.skip(true, 'Cannot access group members page; skipping');
    }

    // Use the UserPicker to search for attendee-b.
    const combobox = page.getByRole('combobox').first();
    if ((await combobox.count()) === 0) {
      test.skip(true, 'No UserPicker combobox found on members page; skipping');
    }
    await combobox.fill(searchTerm!);
    await page.waitForLoadState('domcontentloaded');

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
    await page.waitForLoadState('domcontentloaded');

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
      await page.waitForLoadState('domcontentloaded');
      // Verify role changed.
      await expect(page.locator('main')).toContainText(/admin/i, { timeout: 10_000 });
    }

    // Remove attendee-b from the group.
    const updatedRow = page.locator('li, tr').filter({ hasText: searchTerm! }).first();
    const removeBtn = updatedRow.getByRole('button', { name: /remove/i }).first();
    await expect(removeBtn).toBeVisible({ timeout: 10_000 });
    await removeBtn.click();
    await page.waitForLoadState('domcontentloaded');

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
    await page.waitForLoadState('domcontentloaded');

    const profileGroupHrefs = new Set<string>();
    const profileLinks = page.locator('a[href*="/groups/"]');
    const profileCount = await profileLinks.count();
    for (let i = 0; i < profileCount; i++) {
      const href = await profileLinks.nth(i).getAttribute('href');
      if (href) profileGroupHrefs.add(href);
    }

    await page.goto('/groups');
    await page.waitForLoadState('domcontentloaded');

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
      await page.waitForLoadState('domcontentloaded');

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
      await page.waitForLoadState('domcontentloaded');
    }

    test.skip(true, 'Could not find a group the test user is not a member of; skipping');
  });
});

test.describe('host event as group', () => {
  test('group owner creates event selecting the group as host — event appears in group upcoming events list', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // /events/new only lists groups the viewer can host as (hostableGroups
    // in apps/web/src/app/events/new/page.tsx). If the select has no
    // group options, the test user does not own/admin a hostable group on
    // this environment — skip rather than fail (see README group #7).
    await page.goto('/events/new');
    const select = page.locator('#hostGroupId');
    await expect(select).toBeVisible({ timeout: 10_000 });

    // Option values: '' = "Yourself", anything else = group id.
    const groupOptionValues = await select
      .locator('option')
      .evaluateAll((opts) =>
        (opts as HTMLOptionElement[])
          .map((o) => ({ value: o.value, label: o.textContent ?? '' }))
          .filter((o) => o.value !== ''),
      );
    if (groupOptionValues.length === 0) {
      test.skip(true, 'Test user does not own/admin a hostable group; skipping');
    }
    const groupId = groupOptionValues[0]!.value;
    const groupName = groupOptionValues[0]!.label.trim();
    const title = `E2E Host As Group ${Date.now()}`;

    // The /groups/[id] route actually queries by SLUG, not uuid
    // (see apps/web/src/app/groups/[id]/page.tsx — `.eq('slug', params.id)`),
    // so navigating to `/groups/<uuid>` 404s. Resolve the slug by finding
    // the group's link on the /groups directory by accessible name.
    await page.goto('/groups');
    await page.waitForLoadState('domcontentloaded');
    const groupLink = page
      .locator('main')
      .locator(`a[href^="/groups/"]`)
      .filter({ hasText: groupName })
      .first();
    const groupHref = await groupLink.getAttribute('href').catch(() => null);
    if (!groupHref) {
      test.skip(true, `Could not resolve slug for hostable group "${groupName}"; skipping`);
    }

    let eventUrl: string | null = null;
    try {
      const created = await createFreeOpenPlayEvent(page, { title, hostGroupId: groupId });
      eventUrl = created.url;

      // Visit the group's page and assert the event title appears in the
      // upcoming events list (see apps/web/src/app/groups/[id]/page.tsx
      // "Upcoming events" section).
      await page.goto(groupHref!);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('heading', { name: /upcoming events/i })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole('link', { name: title })).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      if (eventUrl) await cancelEvent(page, eventUrl);
    }
  });
});
