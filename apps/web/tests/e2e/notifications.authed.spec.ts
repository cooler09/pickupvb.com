import { test, expect } from '@playwright/test';

/**
 * Notification flows (Section 13 of the test plan).
 *
 * 13.1: In-app notification bell — bell presence and dropdown are runnable.
 *        Unread badge requires attendee-b (TEST_ATTENDEE_B_EMAIL) to take an action (fixme).
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

  test('/notifications or /profile/notifications page loads without error', async ({ page }) => {
    // Some apps route to a dedicated notifications page instead of a popover.
    const notificationsPage = await page.goto('/notifications');
    const status = notificationsPage?.status() ?? 0;

    if (status === 404 || status === 302) {
      // Try /profile/notifications instead.
      const altResponse = await page.goto('/profile/notifications');
      expect(altResponse?.ok()).toBeTruthy();
    } else {
      expect(notificationsPage?.ok()).toBeTruthy();
    }

    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
  });

  test.fixme(
    'unread badge appears when attendee-b (TEST_ATTENDEE_B_EMAIL) follows or RSVPs — use second browser context',
  );

  test.fixme(
    'clicking a notification navigates to the relevant page and marks the notification read',
  );
});

test.describe('email notifications', () => {
  test.fixme(
    'host (attendee-a) receives "New RSVP" email when attendee-b RSVPs — requires email inspection',
  );

  test.fixme('disabling email in /profile/notifications prevents the RSVP email from being sent');
});
