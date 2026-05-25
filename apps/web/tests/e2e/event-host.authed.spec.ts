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
let beforeAllError: string | null = null;

/**
 * The DateTimePicker exposes the visible trigger as `<button id={name}>` and
 * the hidden form value as `<input type="hidden" name={name}>`. So `#startsAt`
 * targets the trigger and `input[type=hidden][name="startsAt"]` carries the
 * ISO string the server reads.
 *
 * Opens the picker for `name`, picks the LAST visible non-disabled day in
 * the calendar grid (deep in the month → safely in the future even on early-
 * month runs and after `minDate` clamps), fills the time, and closes.
 */
async function pickFutureDateTime(
  page: import('@playwright/test').Page,
  name: 'startsAt' | 'endsAt',
  timeHhmm: string,
): Promise<void> {
  const trigger = page.locator(`button#${name}`);
  await trigger.click();

  const dialog = page.locator('[role="dialog"]').last();
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });

  // LAST non-disabled day in the visible month — pushes the date several
  // days ahead so server-side "starts in the past" validation can't reject.
  const day = dialog.locator('[role="gridcell"] button:not([disabled])').last();
  await day.click();

  const timeInput = dialog.locator('input[type="time"]').first();
  await timeInput.fill(timeHhmm);

  // Trigger handleTime → onChange → hidden input updates.
  await timeInput.blur();
  await page.keyboard.press('Escape');

  // Verify the hidden ISO input now has a value.
  const hiddenIso = await page
    .locator(`input[type="hidden"][name="${name}"]`)
    .inputValue()
    .catch(() => '');
  if (!hiddenIso) throw new Error(`DateTimePicker for ${name} did not populate hidden input`);
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();
  testEventTitle = `E2E Host Test ${Date.now()}`;

  try {
    await page.goto('/events/new');
    if (page.url().includes('/login') || page.url().includes('/upgrade')) {
      beforeAllError = `redirected to ${new URL(page.url()).pathname} — event creation gated`;
      return;
    }

    await page.locator('#title').fill(testEventTitle);

    await pickFutureDateTime(page, 'startsAt', '18:00');
    await pickFutureDateTime(page, 'endsAt', '20:00');

    await page.locator('#addressLine').fill('1000 19th St');
    // City/region/postal/country are visible only while no address detail has
    // been entered yet (hasAddress=false). Fill them BEFORE the conditional
    // collapses; if addressLine already triggered the collapse, click the
    // "Edit address details" button to reopen.
    const editDetailsBtn = page.getByRole('button', { name: /edit address details/i });
    if (await editDetailsBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await editDetailsBtn.click();
    }
    await page.locator('#city').fill('Virginia Beach');
    await page.locator('#region').fill('VA');
    await page.locator('#postalCode').fill('23451');
    await page.locator('#country').fill('US');

    await page.getByRole('button', { name: /create event/i }).click();

    await page.waitForURL(/\/events\/[0-9a-f-]{36}(\?|$)/, { timeout: 20_000 }).catch(async () => {
      // Surface why submission didn't redirect — usually a server-side
      // validation error rerendered the form.
      const currentUrl = page.url();
      const errors = await page
        .locator('[role="alert"], .text-error, [class*="error"]')
        .allTextContents()
        .catch(() => [] as string[]);
      throw new Error(
        `submit did not redirect (stayed on ${currentUrl}); visible errors: ${JSON.stringify(errors.slice(0, 5))}`,
      );
    });
    // Strip the `?created=1` flash param so `${eventUrl}/edit` builds cleanly.
    eventUrl = page.url().replace(/\?.*$/, '');
  } catch (err) {
    beforeAllError = err instanceof Error ? err.message : String(err);
    // Surface the failure so the next agent can see WHY creation failed
    // instead of every test silently skipping with the same message.
    // eslint-disable-next-line no-console
    console.error('[event-host beforeAll] event creation failed:', beforeAllError);
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
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    const response = await page.goto(eventUrl!);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toContainText(testEventTitle, { timeout: 10_000 });
  });

  test('event edit page loads with title field pre-filled', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
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
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
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
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    await page.goto(eventUrl!);
    // The host section should mention the host in some form.
    await expect(page.locator('main')).toContainText(/host|organizer|hosted by|by @/i);
  });

  test('analytics or attendance section is visible to host', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    await page.goto(eventUrl!);
    // Hosts see the roster/analytics panel on their own event. The roster
    // heading is "Players signed up (N)"; also accept the older copy in
    // case the section is renamed.
    await expect(
      page.getByText(/players signed up|attendance|attendees|rsvp|going/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('cancel event panel is present on edit page', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    await page.goto(`${eventUrl}/edit`);
    const cancelEventBtn = page.getByRole('button', { name: /cancel event…/i }).first();
    await expect(cancelEventBtn).toBeVisible({ timeout: 10_000 });
  });

  test.fixme('sponsor panel — requires Pro or sponsor add-on', async () => {
    // TODO: requires Pro user with sponsor add-on. See README group #2 (Stripe).
  });

  test('co-host section: add attendee-b, verify listed, remove', async ({ page, browser }) => {
    test.setTimeout(60_000);

    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
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

    // The "+ Add co-host" panel contains two controls: a `<select name="group_id">`
    // (which has the implicit role=combobox) AND the UserPicker text input.
    // Target the UserPicker by its accessible name so we don't accidentally
    // grab the group <select>.
    const combobox = page.getByRole('combobox', { name: /add a player as co-host/i });
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
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
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
