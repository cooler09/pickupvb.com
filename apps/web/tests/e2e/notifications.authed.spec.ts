import { test, expect } from './_helpers/fixtures';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { isVisibleOrTimeout } from './_helpers/predicates';

/**
 * Notification flows (Section 13 of the test plan).
 *
 * 13.1: In-app notification bell — bell presence and dropdown are runnable.
 *        Unread badge test uses attendee-b (TEST_ATTENDEE_B_EMAIL) to trigger a
 *        notification; the test skips gracefully if attendee-b auth is not set up.
 * 13.2: Email notification — entirely fixme (requires attendee-b + email inspection).
 *
 * Notification preferences (toggle email on/off) are covered in profile-edit.authed.spec.ts.
 */

test.describe('in-app notification bell', () => {
  test('notification bell is visible in the page header', async ({ page }) => {
    await page.goto('/');
    // The bell may be present in the header regardless of unread state.
    const bell = page
      .getByRole('button', { name: /notifications?|bell/i })
      .or(page.locator('[data-testid="notification-bell"]'))
      .or(page.locator('[aria-label*="notification"]'))
      .first();

    await expect(bell).toBeVisible({ timeout: 10_000 });
  });

  test('clicking the notification bell opens a panel or popover', async ({ page }) => {
    await page.goto('/');

    const bell = page
      .getByRole('button', { name: /notifications?|bell/i })
      .or(page.locator('[data-testid="notification-bell"]'))
      .or(page.locator('[aria-label*="notification"]'))
      .first();

    if ((await bell.count()) === 0) {
      test.skip(true, 'No notification bell found; skipping');
    }

    await bell.click();

    // After clicking, a dropdown, popover, or panel should appear.
    const panel = page
      .getByRole('dialog')
      .or(page.locator('[data-testid="notification-panel"]'))
      .or(page.locator('[role="listbox"]'))
      .or(page.getByText(/no notifications|you're all caught up|mark all/i))
      .first();

    await expect(panel).toBeVisible({ timeout: 5_000 });
  });

  test('/notifications page loads without error, or skips if not a routed page', async ({
    page,
  }) => {
    // Some apps route to a dedicated notifications page; others use a popover only.
    // page.goto can throw ERR_ABORTED when Next.js aborts a non-existent route
    // server-side, so wrap both attempts defensively.
    let response: Awaited<ReturnType<typeof page.goto>> = null;
    try {
      response = await page.goto('/notifications');
    } catch {
      test.skip(true, '/notifications navigation aborted — no dedicated notifications page');
      return;
    }

    const status = response?.status() ?? 0;
    if (status === 404 || status >= 300) {
      // This app exposes notifications via the bell popover, not a dedicated route.
      test.skip(
        true,
        '/notifications returned ' + String(status) + ' — no dedicated notifications page',
      );
      return;
    }

    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
  });

  test('unread badge appears when attendee-b follows attendee-a, clicking bell opens panel and clears badge', async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');

    // Determine attendee-a's public handle.
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');
    const handleInput = page.locator('input[name="handle"]').first();
    const ownHandle = (await handleInput.count()) > 0 ? await handleInput.inputValue() : null;
    if (!ownHandle) {
      test.skip(true, 'Could not determine own handle from /profile; skipping');
    }

    // Attendee-b follows attendee-a to generate a notification.
    const bContext = await browser.newContext({ storageState: STORAGE_PATHS.attendeeB });
    const bPage = await bContext.newPage();
    try {
      await bPage.goto(`/players/${ownHandle}`);
      await bPage.waitForLoadState('domcontentloaded');

      // If already following, unfollow first so the follow action is fresh.
      const alreadyFollowing = await isVisibleOrTimeout(
        bPage.getByRole('button', { name: /following|unfollow/i }).first(),
        3_000,
      );
      if (alreadyFollowing) {
        await bPage
          .getByRole('button', { name: /following|unfollow/i })
          .first()
          .click();
        await bPage.waitForLoadState('domcontentloaded');
      }

      const followBtn = bPage.getByRole('button', { name: /\+\s*follow|^follow$/i }).first();
      if ((await followBtn.count()) === 0) {
        test.skip(true, 'No follow button found on attendee-a player page; skipping');
      }
      await followBtn.click();
      await bPage.waitForLoadState('domcontentloaded');
      await expect(bPage.getByRole('button', { name: /following|unfollow/i }).first()).toBeVisible({
        timeout: 10_000,
      });

      // On attendee-a's page, navigate to home and wait for the Realtime notification.
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      // Allow up to 10 s for the Supabase Realtime push to arrive and the badge to appear.
      const bellWithBadge = page.locator('button[aria-label*="Notifications ("]');
      await expect(bellWithBadge).toBeVisible({ timeout: 15_000 });

      // Click the bell — should open the notifications dialog.
      await bellWithBadge.first().click();
      const dialog = page.getByRole('dialog', { name: /notifications/i }).first();
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      // The dialog content should show at least one notification item.
      const hasItem = await isVisibleOrTimeout(dialog.getByText(/followed|follow/i).first(), 5_000);
      expect(hasItem, 'Notification item should appear in the dialog').toBe(true);

      // After opening the dialog the bell should mark notifications read — badge clears.
      await expect(page.locator('button[aria-label*="Notifications ("]')).not.toBeVisible({
        timeout: 10_000,
      });
    } finally {
      // Cleanup: attendee-b unfollows attendee-a.
      await bPage.goto(`/players/${ownHandle}`);
      await bPage.waitForLoadState('domcontentloaded');
      const unfollowBtn = bPage.getByRole('button', { name: /following|unfollow/i }).first();
      if ((await unfollowBtn.count()) > 0) {
        await unfollowBtn.click();
        await bPage.waitForLoadState('domcontentloaded');
      }
      await bContext.close();
    }
  });
});

test.describe('email notifications', () => {
  test.fixme('host (attendee-a) receives "New RSVP" email when attendee-b RSVPs — requires email inspection', async () => {});

  test.fixme('disabling email in /profile/notifications prevents the RSVP email from being sent', async () => {});
});
