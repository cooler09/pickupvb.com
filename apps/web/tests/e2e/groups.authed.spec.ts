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

  test.fixme('Duplicate slug returns a conflict error instead of creating a second group');
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
  test.fixme('Owner can edit group description and changes appear on group profile page');

  test.fixme('Non-member is redirected from /groups/<slug>/members');
});

test.describe('group members', () => {
  test.fixme(
    'Owner can add, promote, and remove a member — use attendee-b (TEST_ATTENDEE_B_EMAIL)',
  );
});
