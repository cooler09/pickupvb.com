import { test, expect } from '@playwright/test';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { deleteGroupBySlug } from './_helpers/cleanup';

/**
 * Find a group the signed-in user is listed under on /profile. Mirrors
 * findOwnedGroupUrl in groups-manage.authed.spec.ts. Returns the group URL
 * (path) or null. The caller probes `/<url>/members` to confirm management
 * rights.
 */
async function findOwnedGroupUrl(page: import('@playwright/test').Page): Promise<string | null> {
  await page.goto('/profile');
  await page.waitForLoadState('domcontentloaded');
  const groupLinks = page.locator('a[href*="/groups/"]');
  const count = await groupLinks.count();
  for (let i = 0; i < count; i++) {
    const href = await groupLinks.nth(i).getAttribute('href');
    if (!href || href.includes('/edit') || href.includes('/members') || href.includes('/new'))
      continue;
    return href.replace(/\/$/, '');
  }
  return null;
}

/**
 * Make sure the signed-in profile has a unique, searchable display_name that
 * the UserPicker's ilike search can hit. Idempotent. Mirrors the helper in
 * teams.authed.spec.ts.
 */
async function ensureSearchableDisplayName(
  page: import('@playwright/test').Page,
  prefix: string,
): Promise<string> {
  await page.goto('/profile');
  await page.waitForLoadState('domcontentloaded');
  const dnInput = page.locator('input[name="display_name"]').first();
  await expect(dnInput).toBeVisible({ timeout: 10_000 });
  const current = await dnInput.inputValue();
  if (current && current.startsWith(prefix)) return current;

  const next = `${prefix} ${Math.random().toString(36).slice(2, 7)}`;
  await dnInput.fill(next);
  await page
    .getByRole('button', { name: /save changes|save profile|update profile/i })
    .first()
    .click();
  await page
    .getByText(/profile updated/i)
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => {
      /* tolerate no alert */
    });
  await page.waitForLoadState('domcontentloaded');
  return next;
}

/**
 * Authenticated group flows.
 *
 * Group creation is tagged @destructive because it writes a real row.
 * The destructive test now also exercises the owner-only UI delete
 * (Bundle 93 / data-lifecycle P2 #1), and falls back to admin
 * hard-delete via the cleanup helper. Exclude from standard runs with
 * `--grep-invert @destructive`.
 *
 * Group follow/unfollow is read-reversible and runs in the standard suite.
 */

test.describe('create group', () => {
  test(
    'creates a group and lands on the group profile page',
    { tag: '@destructive' },
    async ({ page }) => {
      const slug = `e2e-test-group-${Date.now()}`;
      const name = `E2E Test Group ${Date.now()}`;

      await page.goto('/groups/new');
      const response = await page.request.get('/groups/new');
      if (!response.ok()) {
        test.skip(true, '/groups/new not reachable — skipping');
      }

      await page.getByLabel(/name/i).fill(name);
      await page.getByLabel(/slug/i).fill(slug);
      await page.getByRole('button', { name: /create|save/i }).click();

      // Expect redirect to the new group's profile page.
      await page.waitForURL(/\/groups\/.+/, { timeout: 15_000 });
      expect(page.url()).toMatch(/\/groups\//);

      // The group name should appear on the page.
      await expect(page.locator('main')).toContainText(name);

      // Exercise the owner-only UI soft-delete (Bundle 93 / data-lifecycle
      // P2 #1). Navigate to the edit page, open the danger-zone panel,
      // confirm, and assert the redirect to /groups?deleted=1.
      const groupUrl = page.url().replace(/\/$/, '');
      await page.goto(`${groupUrl}/edit`);
      await page.waitForLoadState('domcontentloaded');
      const openDeleteBtn = page.getByRole('button', { name: /^delete group…?$/i });
      if (await openDeleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await openDeleteBtn.click();
        await page.getByRole('button', { name: /yes, delete group/i }).click();
        await page.waitForURL(/\/groups(\?.*)?$/, { timeout: 15_000 });
        expect(page.url()).toMatch(/[?&]deleted=1/);

        // Soft-deleted group's profile page should now 404 (RLS SELECT
        // filter on deleted_at hides the row from every read path).
        const profileResp = await page.request.get(groupUrl);
        expect(profileResp.status()).toBe(404);
      }

      // Belt + suspenders: hard-delete the fixture row via admin client.
      // No-op when E2E_CLEANUP_SUPABASE_* env vars aren't set.
      await deleteGroupBySlug(slug);
    },
  );

  test('duplicate slug returns a conflict error instead of creating a second group', async ({
    page,
  }) => {
    // Find an existing slug from the groups directory to reuse.
    await page.goto('/groups');
    const firstLink = page.locator('a[href*="/groups/"]').first();
    if ((await firstLink.count()) === 0) {
      test.skip(true, 'No groups in this environment; cannot test duplicate slug');
    }
    const existingHref = (await firstLink.getAttribute('href')) ?? '';
    const slugMatch = existingHref.match(/\/groups\/([^/?#]+)/);
    const existingSlug = slugMatch?.[1];
    if (!existingSlug || existingSlug === 'new') {
      test.skip(true, 'Could not extract a slug from groups directory; skipping');
    }

    await page.goto('/groups/new');
    if (!page.url().includes('/groups/new')) {
      test.skip(true, '/groups/new redirected; skipping');
    }

    await page.getByLabel(/name/i).fill('E2E Duplicate Slug Test');
    await page.getByLabel(/slug/i).fill(existingSlug!);
    await page.getByRole('button', { name: /create|save/i }).click();
    await page.waitForLoadState('domcontentloaded');

    const finalUrl = page.url();

    // If a new group was mistakenly created, the page would show our test name.
    const erroneouslyCreated = await page
      .locator('main')
      .getByText(/E2E Duplicate Slug Test/i)
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    expect(erroneouslyCreated, 'Duplicate slug must not create a new group').toBe(false);

    // Expect either to remain on the form page or to see a conflict error.
    const stayedOnForm = finalUrl.includes('/groups/new');
    const hasConflictError = await page
      .getByText(/taken|conflict|already exists|in use|unavailable|duplicate/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(stayedOnForm || hasConflictError).toBe(true);
  });
});

test.describe('follow and unfollow a group', () => {
  test('follow then unfollow the first group in the directory', async ({ page }) => {
    await page.goto('/groups');

    const groupLink = page.locator('a[href*="/groups/"]').first();
    if ((await groupLink.count()) === 0) {
      test.skip(true, 'No groups in this environment; skipping follow test');
    }

    const href = (await groupLink.getAttribute('href')) ?? '/groups';
    await page.goto(href);

    // Find a "Follow" button (only shown to non-members who are signed in).
    const followBtn = page.getByRole('button', { name: /^follow$/i }).first();
    if ((await followBtn.count()) === 0) {
      test.skip(true, 'No Follow button found — user may already be a member or owner');
    }

    await followBtn.click();
    await page.waitForLoadState('domcontentloaded');

    // After following, the button should change to "Following" or "Unfollow".
    await expect(page.getByRole('button', { name: /following|unfollow/i }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Cleanup — unfollow.
    const unfollowBtn = page.getByRole('button', { name: /following|unfollow/i }).first();
    await unfollowBtn.click();
    await page.waitForLoadState('domcontentloaded');

    // Back to follow state.
    await expect(page.getByRole('button', { name: /^follow$/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('group edit', () => {
  // Covered by groups-manage.authed.spec.ts: "owner can edit group description and changes persist"

  test('non-member is redirected from /groups/<slug>/members', async ({ page }) => {
    await page.goto('/groups');
    await page.waitForLoadState('domcontentloaded');

    const groupLinks = page.locator('a[href*="/groups/"]');
    const count = await groupLinks.count();
    if (count === 0) {
      test.skip(true, 'No groups in this environment; skipping non-member redirect test');
    }

    // Try groups from the directory until we find one that redirects the test user
    // away from the /members sub-page (i.e., one we are not a member of).
    for (let i = 0; i < Math.min(count, 5); i++) {
      const href = await groupLinks.nth(i).getAttribute('href');
      if (!href || href.includes('/edit') || href.includes('/members') || href.includes('/new'))
        continue;

      const slug = href.split('/groups/')[1]?.replace(/\/$/, '');
      if (!slug) continue;

      await page.goto(`/groups/${slug}/members`);
      await page.waitForLoadState('domcontentloaded');

      const finalUrl = page.url();
      if (!finalUrl.includes('/members')) {
        // Redirected away — access guard is working.
        const safe =
          finalUrl.includes('/login') ||
          finalUrl.includes(`/groups/${slug}`) ||
          finalUrl === new URL('/', finalUrl).href;
        expect(safe).toBe(true);
        return;
      }

      // Members page loaded — we may be a member of this group; try the next.
      await page.goto('/groups');
      await page.waitForLoadState('domcontentloaded');
    }

    test.skip(
      true,
      'All sampled groups appear accessible to this user; cannot verify non-member redirect',
    );
  });
});

test.describe('group members', () => {
  test('owner adds attendee-b → promotes to admin → removes', async ({ page, browser }) => {
    test.setTimeout(120_000);

    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');

    const groupUrl = await findOwnedGroupUrl(page);
    if (!groupUrl) {
      test.skip(true, 'Test user does not own a group; skipping');
    }

    // Probe the members management page: it only renders the Add form for
    // owners/admins, so absence of the form means the user lacks rights.
    const membersUrl = `${groupUrl}/members`;
    await page.goto(membersUrl);
    await page.waitForLoadState('domcontentloaded');
    const canManage = await page
      .getByRole('combobox', { name: /find a player/i })
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (!canManage) {
      test.skip(true, 'Test user is not owner/admin of the discovered group; skipping');
    }

    // Resolve a searchable display_name for attendee-b.
    const bContext = await browser.newContext({ storageState: STORAGE_PATHS.attendeeB });
    const bPage = await bContext.newPage();
    let searchTerm: string | null = null;
    try {
      searchTerm = await ensureSearchableDisplayName(bPage, 'E2E Attendee B');
    } catch {
      /* fall through; searchTerm stays null */
    } finally {
      await bContext.close().catch(() => {
        /* tolerate teardown errors */
      });
    }
    if (!searchTerm) {
      test.skip(true, 'Could not determine attendee-b display_name; skipping');
    }

    // Reload as owner now that attendee-b's profile is finalized.
    await page.goto(membersUrl);
    await page.waitForLoadState('domcontentloaded');

    // If attendee-b is already a member from a previous run, remove them first
    // so this run starts from a clean baseline.
    const existingRow = page.locator('li').filter({ hasText: new RegExp(searchTerm!, 'i') });
    if ((await existingRow.count()) > 0) {
      const preRemove = existingRow
        .first()
        .getByRole('button', { name: /^remove$/i })
        .first();
      if (await isVisibleOrTimeout(preRemove)) {
        await preRemove.click();
        await page.waitForLoadState('domcontentloaded');
      }
    }

    // ── Add attendee-b as a member via the UserPicker ───────────────────
    const combobox = page.getByRole('combobox', { name: /find a player/i }).first();
    await expect(combobox).toBeVisible({ timeout: 5_000 });
    await combobox.fill(searchTerm!);
    const listbox = page.getByRole('listbox').first();
    await expect(listbox).toBeVisible({ timeout: 10_000 });
    await listbox.getByRole('option').first().click();

    await page
      .getByRole('button', { name: /add member/i })
      .first()
      .click();
    await page.waitForLoadState('domcontentloaded');

    // Attendee-b row should now exist.
    const newRow = page
      .locator('li')
      .filter({ hasText: new RegExp(searchTerm!, 'i') })
      .first();
    await expect(newRow).toBeVisible({ timeout: 10_000 });

    // ── Promote attendee-b to admin ─────────────────────────────────────
    const promoteBtn = newRow.getByRole('button', { name: /→\s*admin/i }).first();
    await expect(promoteBtn).toBeVisible({ timeout: 5_000 });
    await promoteBtn.click();
    await page.waitForLoadState('domcontentloaded');

    // Verify the row now shows the admin role badge.
    const adminRow = page
      .locator('li')
      .filter({ hasText: new RegExp(searchTerm!, 'i') })
      .first();
    await expect(adminRow).toContainText(/admin/i, { timeout: 10_000 });

    // ── Remove attendee-b ───────────────────────────────────────────────
    const removeBtn = adminRow.getByRole('button', { name: /^remove$/i }).first();
    await expect(removeBtn).toBeVisible({ timeout: 5_000 });
    await removeBtn.click();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('li').filter({ hasText: new RegExp(searchTerm!, 'i') })).toHaveCount(
      0,
      { timeout: 10_000 },
    );
  });
});
