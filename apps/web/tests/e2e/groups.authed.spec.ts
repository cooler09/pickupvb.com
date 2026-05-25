import { test, expect } from '@playwright/test';

/**
 * Authenticated group flows.
 *
 * Group creation is tagged @destructive because the app does not expose a
 * delete endpoint in the UI — created groups persist in the dev database.
 * Exclude from standard runs with `--grep-invert @destructive`.
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

      // NOTE: Groups have no delete button in the UI. This group will remain
      // in the dev database. Clean it up manually via the Supabase dashboard
      // or a SQL DELETE if needed.
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
    await page.waitForLoadState('networkidle');

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
    await page.waitForLoadState('networkidle');

    // After following, the button should change to "Following" or "Unfollow".
    await expect(page.getByRole('button', { name: /following|unfollow/i }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Cleanup — unfollow.
    const unfollowBtn = page.getByRole('button', { name: /following|unfollow/i }).first();
    await unfollowBtn.click();
    await page.waitForLoadState('networkidle');

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
  test.fixme(
    'Owner can add, promote, and remove a member — use attendee-b (TEST_ATTENDEE_B_EMAIL)',
  );
});
