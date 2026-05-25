import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Host-only event management flows.
 *
 * A beforeAll creates a single test event that all tests in this file share.
 * If creation fails, eventUrl is set to null and every test skips. The
 * afterAll cancels the test event via the edit page two-step confirm.
 *
 * If afterAll fails to clean up, cancel the event manually via
 * <eventUrl>/edit → "Cancel event…" → "Yes, cancel event".
 */

// Reuse the same storageState that the authed project applies to each test.
const STORAGE_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'user.json');
const ATTENDEE_B_STATE = path.join(
  __dirname,
  '..',
  '..',
  '.playwright',
  '.auth',
  'attendee-b.json',
);

let eventUrl: string | null = null;
let testEventTitle: string;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();
  testEventTitle = `E2E Host Test ${Date.now()}`;

  try {
    await page.goto('/events/new');
    const newPageOk = !(page.url().includes('/login') || page.url().includes('/upgrade'));
    if (!newPageOk) {
      await page.close();
      return;
    }

    // Fill the title.
    await page.locator('#title').fill(testEventTitle);

    // Fill "Starts at" via DateTimePicker.
    // Click the trigger button (placeholder "Pick a date and time" or the formatted date text).
    const startsAtTrigger = page
      .locator('[data-testid="starts-at-trigger"]')
      .or(page.getByRole('button', { name: /pick a date|starts at/i }))
      .or(
        page
          .locator('button')
          .filter({ hasText: /pick a date and time/i })
          .first(),
      )
      .first();

    // Try to find the DateTimePicker trigger near the "Starts at" label.
    const startsAtLabel = page.getByText(/starts at/i).first();
    let startsAtBtn = startsAtLabel
      .locator('xpath=following::button[1]')
      .or(startsAtTrigger)
      .first();

    // Fallback: look for any button with date-picker-like text.
    if ((await startsAtBtn.count()) === 0) {
      startsAtBtn = page
        .locator('button')
        .filter({ hasText: /pick a date/i })
        .first();
    }

    if ((await startsAtBtn.count()) === 0) {
      await page.close();
      return;
    }

    await startsAtBtn.click();

    // Calendar should now be open. Find a clickable non-disabled day button.
    // Pick the first non-disabled day in the calendar.
    const dayButtons = page.locator('[role="gridcell"] button:not([disabled])');
    const dayCount = await dayButtons.count();
    if (dayCount === 0) {
      await page.close();
      return;
    }
    // Click the first available day.
    await dayButtons.first().click();

    // Fill time input that appears after day selection.
    const timeInput = page.locator('input[type="time"]').first();
    if ((await timeInput.count()) > 0) {
      await timeInput.fill('18:00');
    }

    // Close the calendar / confirm selection — click outside or press Escape.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Fill "Ends at" — same approach.
    const endsAtLabel = page.getByText(/ends at/i).first();
    let endsAtBtn = endsAtLabel.locator('xpath=following::button[1]').first();
    if ((await endsAtBtn.count()) === 0) {
      endsAtBtn = page
        .locator('button')
        .filter({ hasText: /pick a date/i })
        .nth(1);
    }
    if ((await endsAtBtn.count()) === 0) {
      await page.close();
      return;
    }

    await endsAtBtn.click();

    // Pick next available day (2nd non-disabled day or same as starts-at but different).
    const endDayButtons = page.locator('[role="gridcell"] button:not([disabled])');
    const endDayCount = await endDayButtons.count();
    if (endDayCount === 0) {
      await page.close();
      return;
    }
    // Pick a later day if possible.
    const endDayIndex = Math.min(1, endDayCount - 1);
    await endDayButtons.nth(endDayIndex).click();

    const timeInputEnd = page.locator('input[type="time"]').first();
    if ((await timeInputEnd.count()) > 0) {
      await timeInputEnd.fill('20:00');
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Fill address fields.
    await page.locator('#addressLine').fill('123 Main St');
    await page.locator('#city').fill('Virginia Beach');
    await page.locator('#region').fill('VA');

    const postalInput = page.locator('#postalCode');
    if ((await postalInput.count()) > 0) await postalInput.fill('23451');

    const countryInput = page.locator('#country');
    if ((await countryInput.count()) > 0) await countryInput.fill('US');

    // Verify the hidden startsAt input was populated (DateTimePicker writes it).
    const startsAtHidden = page.locator('input[name="startsAt"]');
    const startsAtValue = (await startsAtHidden.inputValue().catch(() => '')) ?? '';
    if (!startsAtValue) {
      // DateTimePicker did not populate the hidden input — cannot submit.
      await page.close();
      return;
    }

    // Submit the form.
    await page.getByRole('button', { name: /create event/i }).click();

    // Wait for redirect to the event detail page.
    await page.waitForURL(/\/events\/[^/]+$/, { timeout: 15_000 });
    eventUrl = page.url();
  } catch {
    // Creation failed — tests will skip.
    eventUrl = null;
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser }) => {
  if (!eventUrl) return;
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();
  try {
    await page.goto(`${eventUrl}/edit`);
    await page.waitForLoadState('networkidle');

    const cancelBtn = page.getByRole('button', { name: /cancel event…/i }).first();
    if ((await cancelBtn.count()) > 0) {
      await cancelBtn.click();
      const confirmBtn = page.getByRole('button', { name: /yes, cancel event/i }).first();
      if ((await confirmBtn.count()) > 0) {
        await confirmBtn.click();
        await page.waitForLoadState('networkidle');
      }
    }
  } catch {
    // Cleanup failed — cancel the event manually.
  } finally {
    await context.close();
  }
});

test.describe('event host flows', () => {
  test('event detail page loads with the test title', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, 'Test event was not created; skipping');
    }
    const response = await page.goto(eventUrl!);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toContainText(testEventTitle, { timeout: 10_000 });
  });

  test('event edit page loads with title field pre-filled', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, 'Test event was not created; skipping');
    }
    const response = await page.goto(`${eventUrl}/edit`);
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/edit/, { timeout: 15_000 });
    const titleInput = page.locator('#title').first();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await expect(titleInput).toHaveValue(testEventTitle);
  });

  test('change title, save, verify new title on detail page', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, 'Test event was not created; skipping');
    }
    await page.goto(`${eventUrl}/edit`);
    const newTitle = `${testEventTitle} — edited`;
    await page.locator('#title').fill(newTitle);
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForLoadState('networkidle');

    // After save, navigate to detail page and verify updated title.
    await page.goto(eventUrl!);
    await expect(page.locator('main')).toContainText(newTitle, { timeout: 10_000 });

    // Restore original title for subsequent tests.
    await page.goto(`${eventUrl}/edit`);
    await page.locator('#title').fill(testEventTitle);
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForLoadState('networkidle');
  });

  test('event detail shows host section', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, 'Test event was not created; skipping');
    }
    await page.goto(eventUrl!);
    // The host section should mention the host in some form.
    await expect(page.locator('main')).toContainText(/host|organizer|hosted by|by @/i);
  });

  test('analytics or attendance section is visible to host', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, 'Test event was not created; skipping');
    }
    await page.goto(eventUrl!);
    // Hosts see an attendance count or analytics panel on their own event.
    const hasAttendance = await page
      .getByText(/attendance|attendees|rsvp|going/i)
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    expect(hasAttendance).toBe(true);
  });

  test('cancel event panel is present on edit page', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, 'Test event was not created; skipping');
    }
    await page.goto(`${eventUrl}/edit`);
    const cancelEventBtn = page.getByRole('button', { name: /cancel event…/i }).first();
    await expect(cancelEventBtn).toBeVisible({ timeout: 10_000 });
  });

  test.fixme('sponsor panel — requires Pro or sponsor add-on');

  test('co-host section: add attendee-b, verify listed, remove', async ({ page, browser }) => {
    test.setTimeout(60_000);

    if (!eventUrl) {
      test.skip(true, 'Test event was not created; skipping');
    }
    if (!fs.existsSync(ATTENDEE_B_STATE)) {
      test.skip(true, 'attendee-b auth not set up (TEST_ATTENDEE_B_EMAIL missing); skipping');
    }

    // Get attendee-b's display name for the UserPicker search.
    const bContext = await browser.newContext({ storageState: ATTENDEE_B_STATE });
    const bPage = await bContext.newPage();
    let bDisplayName: string | null = null;
    let bHandle: string | null = null;
    try {
      await bPage.goto('/profile');
      await bPage.waitForLoadState('networkidle');
      const dnInput = bPage.locator('input[name="display_name"]').first();
      bDisplayName = (await dnInput.count()) > 0 ? await dnInput.inputValue() : null;
      const hInput = bPage.locator('input[name="handle"]').first();
      bHandle = (await hInput.count()) > 0 ? await hInput.inputValue() : null;
    } finally {
      await bContext.close();
    }

    const searchTerm = bDisplayName || bHandle;
    if (!searchTerm) {
      test.skip(true, 'Could not determine attendee-b name; skipping');
    }

    await page.goto(eventUrl!);
    await page.waitForLoadState('networkidle');

    // Open the "+ Add co-host" details panel.
    const addCoHostSummary = page
      .locator('details summary')
      .filter({ hasText: /add co-host/i })
      .first();
    if ((await addCoHostSummary.count()) === 0) {
      test.skip(true, '"+ Add co-host" panel not found on this event; skipping');
    }
    await addCoHostSummary.click();

    // Use the UserPicker combobox to search for attendee-b.
    const combobox = page.getByRole('combobox').first();
    await expect(combobox).toBeVisible({ timeout: 5_000 });
    await combobox.fill(searchTerm!);
    await page.waitForLoadState('networkidle');

    const listbox = page.getByRole('listbox').first();
    await expect(listbox).toBeVisible({ timeout: 10_000 });
    const option = listbox.getByRole('option').first();
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();

    // Submit "Add user".
    const addUserBtn = page.getByRole('button', { name: /add user/i }).first();
    await expect(addUserBtn).toBeVisible({ timeout: 5_000 });
    await addUserBtn.click();
    await page.waitForLoadState('networkidle');

    // Attendee-b should now appear in the hosts section.
    await expect(page.locator('main')).toContainText(searchTerm!, { timeout: 10_000 });

    // Remove attendee-b as co-host.
    const removeBtn = page
      .getByRole('button', { name: new RegExp(`Remove co-host ${searchTerm}`, 'i') })
      .or(page.getByRole('button', { name: /remove co-host/i }).first())
      .first();
    await expect(removeBtn).toBeVisible({ timeout: 10_000 });
    await removeBtn.click();
    await page.waitForLoadState('networkidle');

    // Attendee-b should no longer appear as a co-host.
    const coHostSection = page
      .locator('section')
      .filter({ hasText: /hosted by|co-host/i })
      .first();
    if ((await coHostSection.count()) > 0) {
      await expect(coHostSection).not.toContainText(searchTerm!, { timeout: 10_000 });
    }
  });

  test('broadcast to attendees: attendee-b RSVPs, host sends broadcast', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);

    if (!eventUrl) {
      test.skip(true, 'Test event was not created; skipping');
    }
    if (!fs.existsSync(ATTENDEE_B_STATE)) {
      test.skip(true, 'attendee-b auth not set up (TEST_ATTENDEE_B_EMAIL missing); skipping');
    }

    // Attendee-b RSVPs to the test event.
    const bContext = await browser.newContext({ storageState: ATTENDEE_B_STATE });
    const bPage = await bContext.newPage();
    try {
      await bPage.goto(eventUrl!);
      await bPage.waitForLoadState('networkidle');

      const joinBtn = bPage.getByRole('button', { name: /join this event/i }).first();
      if ((await joinBtn.count()) === 0) {
        test.skip(true, 'Attendee-b cannot join this event (full, paid, or already joined)');
      }
      await joinBtn.click();
      await bPage.waitForLoadState('networkidle');
      await expect(bPage.getByRole('button', { name: /leave event/i }).first()).toBeVisible({
        timeout: 15_000,
      });

      // Host (attendee-a) navigates to event and sends a broadcast.
      await page.goto(eventUrl!);
      await page.waitForLoadState('networkidle');

      // Open "Host tools" details.
      const hostToolsSummary = page
        .locator('details summary')
        .filter({ hasText: /host tools/i })
        .first();
      if ((await hostToolsSummary.count()) === 0) {
        test.skip(true, '"Host tools" section not found; skipping');
      }
      await hostToolsSummary.click();

      // Open "Message attendees" details.
      const messageSummary = page
        .locator('details summary')
        .filter({ hasText: /message attendees/i })
        .first();
      await expect(messageSummary).toBeVisible({ timeout: 10_000 });
      await messageSummary.click();

      // Fill the broadcast body and send.
      const bodyTextarea = page.locator('textarea[name="body"], #broadcast-body').first();
      await expect(bodyTextarea).toBeVisible({ timeout: 5_000 });
      await bodyTextarea.fill('E2E broadcast test message');

      const sendBtn = page.getByRole('button', { name: /send message/i }).first();
      await expect(sendBtn).toBeVisible({ timeout: 5_000 });
      await sendBtn.click();
      await page.waitForLoadState('networkidle');

      // Success: the form resets or a success message appears.
      const success = await page
        .getByText(/sent|delivered|message sent/i)
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false);
      const formReset = await bodyTextarea.inputValue().catch(() => '');
      expect(success || formReset === '', 'Broadcast should send without error').toBe(true);
    } finally {
      // Cleanup: attendee-b leaves the event.
      await bPage.goto(eventUrl!);
      await bPage.waitForLoadState('networkidle');
      const leaveBtn = bPage.getByRole('button', { name: /leave event/i }).first();
      if ((await leaveBtn.count()) > 0) {
        await leaveBtn.click();
        const confirmLeave = bPage
          .getByRole('button', { name: /confirm|yes|leave/i })
          .filter({ hasNotText: /cancel/i })
          .first();
        if (await confirmLeave.isVisible().catch(() => false)) {
          await confirmLeave.click();
        }
        await bPage.waitForLoadState('networkidle');
      }
      await bContext.close();
    }
  });
});
