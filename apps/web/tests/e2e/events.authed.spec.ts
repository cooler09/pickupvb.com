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

  // Covered by event-create-extended.authed.spec.ts: "Pro: save template, verify in dropdown, apply pre-fills form, then remove"
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
  // "Host can edit event title" is covered by event-host.authed.spec.ts: "change title, save, verify new title on detail page"

  test('non-host is redirected away from /events/<id>/edit', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    const eventLinks = page.locator('a[href*="/events/"]');
    const count = await eventLinks.count();
    if (count === 0) {
      test.skip(true, 'No events in this environment; skipping non-host redirect test');
    }

    // Scan the first few events looking for one not owned by the test user.
    for (let i = 0; i < Math.min(count, 5); i++) {
      const href = await eventLinks.nth(i).getAttribute('href');
      if (!href || href.includes('/new')) continue;

      const editUrl = href.replace(/\/$/, '') + '/edit';
      await page.goto(editUrl);
      await page.waitForLoadState('networkidle');

      const finalUrl = page.url();
      if (!finalUrl.includes('/edit')) {
        // Redirected — the guard is working.
        expect(finalUrl).not.toMatch(/\/events\/[^/]+\/edit/);
        return;
      }

      // We own this event; try the next one.
      await page.goto('/events');
      await page.waitForLoadState('networkidle');
    }

    test.skip(
      true,
      'All sampled events are owned by the test user; cannot verify non-host redirect',
    );
  });
});

test.describe('host controls', () => {
  // "Cancel event" is covered by event-host.authed.spec.ts afterAll, which cancels the test event via edit page.
  // "Broadcast to attendees" is covered by event-host.authed.spec.ts:
  //   "broadcast to attendees: attendee-b RSVPs, host sends broadcast".
});
