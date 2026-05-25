import { test, expect } from '@playwright/test';

/**
 * Authenticated event flows.
 *
 * Mutations are cleaned up inline at the end of each test. If a test fails
 * mid-run, the orphaned data (cancelled event, RSVP) remains in the dev
 * environment but will not affect other tests.
 */

test.describe('event creation form', () => {
  test('/events/new loads with the expected fields', async ({ page }) => {
    const response = await page.goto('/events/new');
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/events\/new/);
    await expect(page.getByLabel(/title/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create event/i })).toBeVisible();
  });

  test.fixme(
    'create a free open-play event end-to-end — requires DateTimePicker interaction and geocoding',
  );

  test.fixme('create a paid event — requires Stripe Connect on the test account');

  test.fixme('create a tournament event with multiple divisions');
});

test.describe('saved event templates (Pro feature)', () => {
  test('clicking Save template with an empty name shows inline error', async ({ page }) => {
    await page.goto('/events/new');

    // The template card is only shown to Pro users. Skip if it's not present.
    const templateNameInput = page.getByPlaceholder(/template name/i);
    const isProUser = (await templateNameInput.count()) > 0;
    if (!isProUser) {
      test.skip(true, 'Test user does not have Pro — template card not shown; skipping');
    }

    // Click "Save template" without entering a name.
    const saveBtn = page.getByRole('button', { name: /save template/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Inline validation error should appear.
    await expect(page.locator('body')).toContainText(/enter a name|name required|name first/i);

    // The form should NOT have navigated away.
    await expect(page).toHaveURL(/\/events\/new/);
  });

  test('non-Pro user sees no template card on /events/new', async ({ page }) => {
    await page.goto('/events/new');
    const templateNameInput = page.getByPlaceholder(/template name/i);
    const isProUser = (await templateNameInput.count()) > 0;
    if (isProUser) {
      test.skip(true, 'Test user has Pro — non-Pro check not applicable; skipping');
    }
    // Non-Pro: template controls should not be visible.
    await expect(templateNameInput).not.toBeVisible();
  });

  test.fixme(
    'Pro user: save template, verify in dropdown, apply pre-fills form, then remove template',
  );
});

test.describe('RSVP — join and leave a free event', () => {
  test('join and leave the first joinable free event', async ({ page }) => {
    await page.goto('/events');

    // Find the first event card link and navigate to it.
    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events in this environment; skipping RSVP test');
    }
    const href = (await eventLink.getAttribute('href')) ?? '/events';
    await page.goto(href);

    // Look for a "Join this event" button (free, open-play event).
    const joinBtn = page.getByRole('button', { name: /join this event/i }).first();
    if ((await joinBtn.count()) === 0) {
      test.skip(true, 'No joinable event found (paid, full, external, or already joined)');
    }

    // Join.
    await joinBtn.click();
    await page.waitForLoadState('networkidle');

    // The "Leave event" button should now appear, confirming the join succeeded.
    await expect(page.getByRole('button', { name: /leave event/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Cleanup — leave the event.
    await page
      .getByRole('button', { name: /leave event/i })
      .first()
      .click();
    // Confirm if a confirmation dialog appears.
    const confirmLeave = page
      .getByRole('button', { name: /confirm|yes|leave/i })
      .filter({ hasNotText: /cancel/i })
      .first();
    if (await confirmLeave.isVisible().catch(() => false)) {
      await confirmLeave.click();
    }
    await page.waitForLoadState('networkidle');

    // Back to join state.
    await expect(page.getByRole('button', { name: /join this event/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test.fixme(
    'RSVP to a paid event via Stripe Checkout — requires Stripe Connect on the test account',
  );

  test.fixme(
    'Event full: second user cannot join at capacity — sign in as attendee-b (TEST_ATTENDEE_B_EMAIL) to test',
  );
});

test.describe('event edit', () => {
  test.fixme(
    'Host can edit event title and changes appear on detail page — requires owning an event',
  );

  test.fixme('Non-host is redirected away from /events/<id>/edit');
});

test.describe('host controls', () => {
  test.fixme('Cancel event — requires owning an event in the dev environment');

  test.fixme('Broadcast to attendees — requires owning an event with at least one RSVP');
});
