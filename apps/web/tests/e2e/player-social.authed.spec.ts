import { test, expect } from '@playwright/test';

/**
 * Authenticated player social flows: own public profile, player directory,
 * follow/unfollow, friends list.
 *
 * Follow/unfollow is fully reversed within the test body. If the test fails
 * before the unfollow step, the follow relationship remains in the dev
 * database — clean up via the /players/<handle> page or Supabase dashboard.
 */

test.describe('own public profile', () => {
  test('own public profile loads at /players/<handle>', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Look for a link to /players/<handle> on the profile page.
    const playerLink = page.locator('a[href*="/players/"]').first();
    let profileUrl: string | null = null;

    if ((await playerLink.count()) > 0) {
      profileUrl = await playerLink.getAttribute('href');
    }

    // Fallback: look for a handle input whose value gives us the handle.
    if (!profileUrl) {
      const handleInput = page.locator('input[name="handle"]').first();
      if ((await handleInput.count()) > 0) {
        const handle = await handleInput.inputValue();
        if (handle) profileUrl = `/players/${handle}`;
      }
    }

    if (!profileUrl) {
      test.skip(true, 'Could not determine own handle from profile page; skipping');
    }

    const response = await page.goto(profileUrl!);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    // Public profile should not expose raw email addresses.
    await expect(page.locator('body')).not.toContainText(/@.*\.com/);
  });

  test('profile page shows edit form or "Edit profile" link', async ({ page }) => {
    await page.goto('/profile');
    // Either the form is rendered directly or there is an "Edit profile" CTA.
    const hasForm = await page
      .locator('input[name="display_name"]')
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    const hasEditLink = await page
      .getByRole('link', { name: /edit profile/i })
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    const hasEditButton = await page
      .getByRole('button', { name: /edit profile/i })
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(hasForm || hasEditLink || hasEditButton).toBe(true);
  });
});

test.describe('player directory', () => {
  test('signed-in user profile is listed in /players directory', async ({ page }) => {
    // Get own handle/display_name from profile page first.
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    let ownHandle: string | null = null;

    const handleInput = page.locator('input[name="handle"]').first();
    if ((await handleInput.count()) > 0) {
      ownHandle = await handleInput.inputValue();
    }

    if (!ownHandle) {
      const displayNameInput = page.locator('input[name="display_name"]').first();
      if ((await displayNameInput.count()) > 0) {
        ownHandle = await displayNameInput.inputValue();
      }
    }

    if (!ownHandle) {
      test.skip(true, 'Could not determine own handle or display name; skipping');
    }

    await page.goto(`/players?q=${encodeURIComponent(ownHandle!)}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toContainText(ownHandle!, { timeout: 10_000 });
  });
});

test.describe('follow and unfollow a player', () => {
  test('follow first non-self player, verify Following, then unfollow', async ({ page }) => {
    // Determine own handle so we can skip self in the player list.
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    let ownHandle: string | null = null;
    const handleInput = page.locator('input[name="handle"]').first();
    if ((await handleInput.count()) > 0) {
      ownHandle = await handleInput.inputValue();
    }

    await page.goto('/players');
    await page.waitForLoadState('networkidle');

    const playerLinks = page.locator('a[href*="/players/"]');
    const linkCount = await playerLinks.count();
    if (linkCount === 0) {
      test.skip(true, 'No players in directory; skipping follow test');
    }

    // Find a player link that is NOT the current user.
    let targetHref: string | null = null;
    for (let i = 0; i < linkCount; i++) {
      const href = await playerLinks.nth(i).getAttribute('href');
      if (!href) continue;
      if (ownHandle && href.includes(`/players/${ownHandle}`)) continue;
      targetHref = href;
      break;
    }

    if (!targetHref) {
      test.skip(true, 'No other players found in directory; skipping follow test');
    }

    await page.goto(targetHref!);
    await page.waitForLoadState('networkidle');

    // Look for the "+ Follow" button.
    const followBtn = page
      .getByRole('button', { name: /\+\s*follow/i })
      .or(page.getByRole('button', { name: /^follow$/i }))
      .first();

    if ((await followBtn.count()) === 0) {
      test.skip(true, 'No Follow button found on this player page; may already be following');
    }

    await followBtn.click();
    await page.waitForLoadState('networkidle');

    // Verify "✓ Following" or "Following" or "Unfollow" appears.
    const followingIndicator = page
      .getByRole('button', { name: /following|unfollow/i })
      .or(page.getByText(/✓\s*following/i))
      .first();
    await expect(followingIndicator).toBeVisible({ timeout: 10_000 });

    // Cleanup — unfollow.
    const unfollowBtn = page.getByRole('button', { name: /following|unfollow/i }).first();
    await unfollowBtn.click();
    await page.waitForLoadState('networkidle');

    // Verify we are back to the follow state.
    const backToFollow = page
      .getByRole('button', { name: /\+\s*follow/i })
      .or(page.getByRole('button', { name: /^follow$/i }))
      .first();
    await expect(backToFollow).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('friends and following', () => {
  test('/friends page loads without error', async ({ page }) => {
    const response = await page.goto('/friends');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
  });

  test.fixme(
    '/events?when=following loads — covered in profile.authed.spec.ts; marked fixme to avoid duplication',
  );

  test.fixme(
    'mutual follow shown on /friends — sign in as attendee-b (TEST_ATTENDEE_B_EMAIL) and follow back',
  );

  test.fixme(
    'notification bell shows unread badge when another user follows — use attendee-b (TEST_ATTENDEE_B_EMAIL) to trigger',
  );
});
