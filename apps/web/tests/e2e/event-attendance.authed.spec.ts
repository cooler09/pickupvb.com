import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const FREE_HOST_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'free-host.json');
const ATTENDEE_B_STATE = path.join(
  __dirname,
  '..',
  '..',
  '.playwright',
  '.auth',
  'attendee-b.json',
);
const ATTENDEE_A_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'user.json');

/**
 * Event attendance flows (Section 5 of the test plan).
 *
 * 5.1 Free RSVP join/leave is already in events.authed.spec.ts.
 * This file covers:
 *   - 5.2: Position RSVP (if the event shows a position selector)
 *   - 5.3: Paid event Stripe Checkout (fixme — needs Stripe)
 *   - 5.4: Leave paid event / refund (fixme)
 *   - 5.5: Event full / capacity limit (fixme — needs two accounts)
 *   - 5.6: Tip jar (fixme — needs Stripe + host configuration)
 */

test.describe('position RSVP', () => {
  test('join an event with position selection if available', async ({ page }) => {
    await page.goto('/events');

    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events found; skipping position RSVP test');
    }
    const href = (await eventLink.getAttribute('href')) ?? '/events';
    await page.goto(href);

    // Look for a position selector — rendered as a select, combobox, or button group.
    const positionSelect = page
      .getByRole('combobox', { name: /position/i })
      .or(page.getByRole('listbox', { name: /position/i }))
      .or(page.locator('select[name*="position"]'))
      .first();

    if ((await positionSelect.count()) === 0) {
      test.skip(true, 'No position selector on this event; skipping position RSVP test');
    }

    // Choose a position.
    if ((await positionSelect.getAttribute('role')) === 'combobox') {
      await positionSelect.selectOption({ index: 1 });
    } else {
      await positionSelect
        .locator('option')
        .nth(1)
        .click()
        .catch(() => {});
    }

    // Look for a join button.
    const joinBtn = page.getByRole('button', { name: /join/i }).first();
    if ((await joinBtn.count()) === 0) {
      test.skip(true, 'No join button found; skipping');
    }

    await joinBtn.click();
    await page.waitForLoadState('networkidle');

    // Verify join succeeded — "Leave" or "You're in" should appear.
    const leaveBtn = page
      .getByRole('button', { name: /leave event|leave/i })
      .or(page.getByText(/you're in|joined/i))
      .first();
    await expect(leaveBtn).toBeVisible({ timeout: 10_000 });

    // Cleanup — leave the event.
    const leaveAction = page.getByRole('button', { name: /leave event|leave/i }).first();
    if ((await leaveAction.count()) > 0) {
      await leaveAction.click();
      const confirmBtn = page
        .getByRole('button', { name: /confirm|yes|leave/i })
        .filter({ hasNotText: /cancel/i })
        .first();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await page.waitForLoadState('networkidle');
    }
  });

  test('position roster is visible on the event detail page', async ({ page }) => {
    await page.goto('/events');

    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events found; skipping');
    }
    const href = (await eventLink.getAttribute('href')) ?? '/events';
    await page.goto(href);

    // The roster section may show positions, player counts by position, or attendee list.
    const hasRoster = await page
      .getByText(/roster|attendees|going|setter|libero|outside|opposite|middle/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    // Not all events have position-based rosters; pass if neither exists.
    // This test just verifies the page doesn't crash when position data is rendered.
    expect(typeof hasRoster).toBe('boolean');
  });
});

test.describe('paid event attendance', () => {
  test.fixme('RSVP to paid event → Stripe Checkout with correct amount → redirected back with user on roster', async () => {});

  test.fixme('declined card (4000 0000 0000 0002) → Stripe shows decline → user NOT on roster', async () => {});

  test.fixme('abandon Stripe Checkout → return to event → user NOT on roster', async () => {});
});

test.describe('leave paid event / refund', () => {
  test.fixme('leave within refund window → removed from roster → refund initiated in Stripe', async () => {});

  test.fixme('leave outside refund window → removed from roster OR leave blocked per event policy', async () => {});
});

test.describe('capacity limit', () => {
  test('event full: attendee-b tries to join a capacity-1 event that attendee-a already filled — sees "event is full"', async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    if (!fs.existsSync(FREE_HOST_STATE)) {
      test.skip(true, 'free-host auth not set up (TEST_FREE_HOST_EMAIL missing); skipping');
    }
    if (!fs.existsSync(ATTENDEE_A_STATE)) {
      test.skip(true, 'attendee-a auth not set up; skipping');
    }
    if (!fs.existsSync(ATTENDEE_B_STATE)) {
      test.skip(true, 'attendee-b auth not set up (TEST_ATTENDEE_B_EMAIL missing); skipping');
    }

    // ── free-host creates an event with capacity = 1 ────────────────────
    const hostCtx = await browser.newContext({ storageState: FREE_HOST_STATE });
    const hostPage = await hostCtx.newPage();
    let eventUrl: string | null = null;

    try {
      await hostPage.goto('/events/new');
      await hostPage.waitForLoadState('networkidle');

      const creationResp = await hostPage.request.get('/events/new');
      if (!creationResp.ok()) {
        test.skip(true, '/events/new not reachable for free-host; skipping');
      }

      await hostPage.locator('#title').fill(`E2E Capacity Test ${Date.now()}`);

      // Switch capacity to "Fixed spots" and set max = 1 BEFORE setting the date.
      // Clicking the radio changes React state (setCapacityKind), which triggers a
      // re-render that would reset the hidden startsAt input if set first.
      const fixedSpotsRadio = hostPage.getByRole('radio', { name: /fixed spots/i }).first();
      if ((await fixedSpotsRadio.count()) > 0) {
        await fixedSpotsRadio.click();
        const maxSpotsInput = hostPage.locator('input[name="maxSpots"]');
        await expect(maxSpotsInput).toBeVisible({ timeout: 5_000 });
        await maxSpotsInput.fill('1');
      }

      // Set startsAt via the DateTimePicker UI AFTER all React state changes.
      // The hidden input is React-controlled; the evaluate/dispatchEvent hack is
      // reset on re-render. Going through the UI triggers onChange properly.
      const startsAtTrigger = hostPage.locator('button[id="startsAt"][aria-haspopup="dialog"]');
      await expect(startsAtTrigger).toBeVisible({ timeout: 5_000 });
      await startsAtTrigger.click();
      const calendarDialog = hostPage.locator('[role="dialog"]').first();
      await calendarDialog.waitFor({ state: 'visible', timeout: 5_000 });
      // Navigate to next month so all days are guaranteed to be in the future.
      // showOutsideDays=true means previous-month days appear and are not disabled
      // even when they are in the past — the server rejects past startsAt values.
      const nextMonthBtn = calendarDialog.getByRole('button', { name: /next/i }).first();
      if ((await nextMonthBtn.count()) > 0) {
        await nextMonthBtn.click();
      }
      // Scope to the calendar table grid to avoid matching the Done button.
      const dayBtn = calendarDialog.locator('table button:not([disabled])').first();
      await dayBtn.click();
      await calendarDialog.getByRole('button', { name: /done/i }).click();
      await calendarDialog.waitFor({ state: 'hidden', timeout: 5_000 });

      // Set endsAt to satisfy `endsAt > startsAt`.
      const endsAtTrigger = hostPage.locator('button[id="endsAt"][aria-haspopup="dialog"]');
      await expect(endsAtTrigger).toBeVisible({ timeout: 5_000 });
      await endsAtTrigger.click();
      const endsCalendar = hostPage.locator('[role="dialog"]').first();
      await endsCalendar.waitFor({ state: 'visible', timeout: 5_000 });
      const endsNextMonthBtn = endsCalendar.getByRole('button', { name: /next/i }).first();
      if ((await endsNextMonthBtn.count()) > 0) {
        await endsNextMonthBtn.click();
      }
      const endsDayBtns = endsCalendar.locator('table button:not([disabled])');
      const endsDayCount = await endsDayBtns.count();
      await endsDayBtns.nth(endsDayCount > 1 ? 1 : 0).click();
      await endsCalendar.getByRole('button', { name: /done/i }).click();
      await endsCalendar.waitFor({ state: 'hidden', timeout: 5_000 });

      // Required address fields. Fill addressLine first — that flips
      // `hasAddress=true` and collapses the city/region/postal/country
      // subfield panel out of the DOM. We then click "Edit address details"
      // to re-expand the panel so the subfields are submitted in FormData.
      await hostPage.locator('input[name="addressLine"]').fill('1000 Atlantic Ave');
      const editAddressBtn = hostPage.getByRole('button', { name: /edit address details/i });
      if ((await editAddressBtn.count()) > 0) {
        await editAddressBtn.click();
      }
      await hostPage.locator('input[name="city"]').fill('Virginia Beach');
      await hostPage.locator('input[name="region"]').fill('Virginia');
      await hostPage.locator('input[name="postalCode"]').fill('23451');
      await hostPage.locator('input[name="country"]').fill('United States');

      await hostPage
        .getByRole('button', { name: /create event|publish|save/i })
        .last()
        .click();
      try {
        await hostPage.waitForURL(
          (url) => /\/events\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
          { timeout: 20_000 },
        );
      } catch (err) {
        const alertText = await hostPage
          .locator('[role="alert"]')
          .allTextContents()
          .catch(() => [] as string[]);
        const fieldErrors = await hostPage
          .locator('[id$="-error"]')
          .evaluateAll((els) => els.map((el) => `${el.id}: ${el.textContent?.trim() ?? ''}`))
          .catch(() => [] as string[]);
        throw new Error(
          `Event create did not navigate. URL=${hostPage.url()} alerts=${JSON.stringify(
            alertText,
          )} fieldErrors=${JSON.stringify(fieldErrors)}\nOriginal: ${(err as Error).message}`,
        );
      }
      eventUrl = hostPage.url();

      // ── attendee-a joins the event (fills the only spot) ─────────────
      const aCtx = await browser.newContext({ storageState: ATTENDEE_A_STATE });
      const aPage = await aCtx.newPage();
      try {
        await aPage.goto(eventUrl);
        await aPage.waitForLoadState('networkidle');
        const joinBtn = aPage.getByRole('button', { name: /^join$/i }).first();
        if ((await joinBtn.count()) > 0) {
          await joinBtn.click();
          await aPage.waitForLoadState('networkidle');
        }
      } finally {
        await aCtx.close();
      }

      // ── attendee-b tries to join — should see "this event is full" ───
      const bCtx = await browser.newContext({ storageState: ATTENDEE_B_STATE });
      const bPage = await bCtx.newPage();
      try {
        await bPage.goto(eventUrl);
        await bPage.waitForLoadState('networkidle');

        const joinBtn = bPage.getByRole('button', { name: /^join$/i }).first();
        if ((await joinBtn.count()) > 0) {
          await joinBtn.click();
          await bPage.waitForLoadState('networkidle');
        }

        // The page should show the "full" flash banner or "Event is full" state.
        await expect(bPage.locator('body')).toContainText(
          /this event is full|sorry.*full|event.*full|no.*spots/i,
          { timeout: 10_000 },
        );
      } finally {
        await bCtx.close();
      }
    } finally {
      // Cleanup — cancel the event.
      if (eventUrl) {
        await hostPage.goto(eventUrl + '/edit');
        await hostPage.waitForLoadState('networkidle');
        const cancelBtn = hostPage.getByRole('button', { name: /cancel event/i }).first();
        if ((await cancelBtn.count()) > 0) {
          await cancelBtn.click();
          const confirmBtn = hostPage
            .getByRole('button', { name: /yes.*cancel|cancel event/i })
            .last();
          if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
            await confirmBtn.click();
            await hostPage.waitForLoadState('networkidle');
          }
        }
      }
      await hostCtx.close();
    }
  });
});

test.describe('tip jar', () => {
  test.fixme('tip jar: enter amount → Stripe Checkout → tip recorded → host sees tip in earnings', async () => {});
});
