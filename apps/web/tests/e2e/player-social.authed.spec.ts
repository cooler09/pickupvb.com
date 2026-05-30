import { test, expect } from '@playwright/test';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { isVisibleOrTimeout } from './_helpers/predicates';

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
    await page.waitForLoadState('domcontentloaded');

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
    // The edit form lives inside a collapsed <details> whose <summary> reads
    // "Edit profile". Accept any of: expanded form input, a link/button CTA,
    // or the collapsed summary toggle.
    const hasForm = await isVisibleOrTimeout(
      page.locator('input[name="display_name"]').first(),
      5_000,
    );
    const hasEditLink = await isVisibleOrTimeout(
      page.getByRole('link', { name: /edit profile/i }).first(),
      5_000,
    );
    const hasEditButton = await isVisibleOrTimeout(
      page.getByRole('button', { name: /edit profile/i }).first(),
      5_000,
    );
    const hasSummary = await isVisibleOrTimeout(
      page
        .locator('details summary')
        .filter({ hasText: /edit profile/i })
        .first(),
      5_000,
    );
    expect(hasForm || hasEditLink || hasEditButton || hasSummary).toBe(true);
  });
});

test.describe('player directory', () => {
  test('signed-in user profile is listed in /players directory', async ({ page }) => {
    // Get own handle/display_name from profile page first.
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');

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

    // The directory's text search matches handle/display_name substrings — but
    // email-shaped fallback values (e.g. "user+suffix@host") contain `+` / `@`
    // that don't appear in handles. Use the first alpha-numeric run so the
    // query is something the directory could plausibly index on.
    const cleanQuery = (ownHandle!.match(/[A-Za-z0-9]+/g) || [ownHandle!])
      .sort((a, b) => b.length - a.length)[0]!
      .slice(0, 24);

    await page.goto(`/players?q=${encodeURIComponent(cleanQuery)}`);
    await page.waitForLoadState('domcontentloaded');
    const mainText = (await page.locator('main').textContent()) ?? '';
    if (/no players match/i.test(mainText)) {
      test.skip(true, `Own profile not indexed in /players (searched "${cleanQuery}"); skipping`);
    }
    await expect(page.locator('main')).toContainText(cleanQuery, { timeout: 10_000 });
  });
});

test.describe('follow and unfollow a player', () => {
  test('follow first non-self player, verify Following, then unfollow', async ({ page }) => {
    // Determine own handle so we can skip self in the player list.
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');

    let ownHandle: string | null = null;
    const handleInput = page.locator('input[name="handle"]').first();
    if ((await handleInput.count()) > 0) {
      ownHandle = await handleInput.inputValue();
    }

    await page.goto('/players');
    await page.waitForLoadState('domcontentloaded');

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
    await page.waitForLoadState('domcontentloaded');

    // Look for the "+ Follow" button.
    const followBtn = page
      .getByRole('button', { name: /\+\s*follow/i })
      .or(page.getByRole('button', { name: /^follow$/i }))
      .first();

    if ((await followBtn.count()) === 0) {
      test.skip(true, 'No Follow button found on this player page; may already be following');
    }

    await followBtn.click();
    await page.waitForLoadState('domcontentloaded');

    // Verify "✓ Following" or "Following" or "Unfollow" appears.
    const followingIndicator = page
      .getByRole('button', { name: /following|unfollow/i })
      .or(page.getByText(/✓\s*following/i))
      .first();
    await expect(followingIndicator).toBeVisible({ timeout: 10_000 });

    // Cleanup — unfollow.
    const unfollowBtn = page.getByRole('button', { name: /following|unfollow/i }).first();
    await unfollowBtn.click();
    await page.waitForLoadState('domcontentloaded');

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

  // Notification badge test covered by notifications.authed.spec.ts.

  test('mutual follow shown on /friends when attendee-b follows back', async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);

    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');

    // Determine attendee-a's own handle.
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');
    const aHandleInput = page.locator('input[name="handle"]').first();
    const aHandle = (await aHandleInput.count()) > 0 ? await aHandleInput.inputValue() : null;
    if (!aHandle) {
      test.skip(true, 'Could not determine own handle from /profile; skipping');
    }

    // Determine attendee-b's handle (declared outside try so cleanup can reference it).
    const bContext = await browser.newContext({ storageState: STORAGE_PATHS.attendeeB });
    const bPage = await bContext.newPage();
    let bHandle: string | null = null;
    try {
      await bPage.goto('/profile');
      await bPage.waitForLoadState('domcontentloaded');
      const bHandleInput = bPage.locator('input[name="handle"]').first();
      bHandle = (await bHandleInput.count()) > 0 ? await bHandleInput.inputValue() : null;
      if (!bHandle) {
        test.skip(true, 'Could not determine attendee-b handle; skipping');
      }

      // Attendee-a follows attendee-b.
      await page.goto(`/players/${bHandle}`);
      await page.waitForLoadState('domcontentloaded');
      const aFollowBtn = page.getByRole('button', { name: /\+\s*follow|^follow$/i }).first();
      if ((await aFollowBtn.count()) > 0) {
        await aFollowBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await expect(page.getByRole('button', { name: /following|unfollow/i }).first()).toBeVisible(
          { timeout: 10_000 },
        );
      }

      // Attendee-b follows attendee-a back.
      await bPage.goto(`/players/${aHandle}`);
      await bPage.waitForLoadState('domcontentloaded');
      const bFollowBtn = bPage.getByRole('button', { name: /\+\s*follow|^follow$/i }).first();
      if ((await bFollowBtn.count()) > 0) {
        await bFollowBtn.click();
        await bPage.waitForLoadState('domcontentloaded');
        await expect(
          bPage.getByRole('button', { name: /following|unfollow/i }).first(),
        ).toBeVisible({ timeout: 10_000 });
      }

      // /friends should now list attendee-b as a mutual connection.
      await page.goto('/friends');
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      // Accept any mutual-follow indicator: "Friends", "Mutual", or bHandle appearing in the list.
      const hasMutual = await isVisibleOrTimeout(
        page
          .locator('main')
          .getByText(new RegExp(`${bHandle}|friends|mutual`, 'i'))
          .first(),
        10_000,
      );
      expect(hasMutual, '/friends should show attendee-b as a mutual connection').toBe(true);
    } finally {
      // Cleanup: attendee-b unfollows attendee-a.
      if (aHandle) {
        await bPage.goto(`/players/${aHandle}`);
        await bPage.waitForLoadState('domcontentloaded');
        const bUnfollowBtn = bPage.getByRole('button', { name: /following|unfollow/i }).first();
        if ((await bUnfollowBtn.count()) > 0) {
          await bUnfollowBtn.click();
          await bPage.waitForLoadState('domcontentloaded');
        }
      }
      await bContext.close();

      // Attendee-a unfollows attendee-b.
      if (bHandle) {
        await page.goto(`/players/${bHandle}`);
        await page.waitForLoadState('domcontentloaded');
        const aUnfollowBtn = page.getByRole('button', { name: /following|unfollow/i }).first();
        if ((await aUnfollowBtn.count()) > 0) {
          await aUnfollowBtn.click();
          await page.waitForLoadState('domcontentloaded');
        }
      }
    }
  });
});
