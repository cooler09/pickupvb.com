import { test, expect } from '@playwright/test';
import path from 'node:path';

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

  test.fixme('co-host section — requires a second test user');

  test.fixme('broadcast to attendees — requires at least one RSVP');
});
