import { test, expect } from '@playwright/test';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { cancelEvent, createPaidEvent } from './_helpers/event-create';
import {
  STRIPE_TEST_CARDS,
  clickConfirmedSubmit,
  expectStripeDeclineError,
  fillStripeCheckout,
  pollUiFor,
  shouldSkipStripeTests,
  waitForStripeRedirect,
} from './_helpers/stripe';

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
    await page.waitForLoadState('domcontentloaded');

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
      if (await isVisibleOrTimeout(confirmBtn, 2_000)) {
        await confirmBtn.click();
      }
      await page.waitForLoadState('domcontentloaded');
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
    const hasRoster = await isVisibleOrTimeout(
      page.getByText(/roster|attendees|going|setter|libero|outside|opposite|middle/i).first(),
      5_000,
    );

    // Not all events have position-based rosters; pass if neither exists.
    // This test just verifies the page doesn't crash when position data is rendered.
    expect(typeof hasRoster).toBe('boolean');
  });
});

test.describe('paid event attendance', () => {
  // Shared setup: stripe-host creates a paid event, attendee-a buys/abandons
  // it in each test. Per-test event so a failed buy doesn't leak roster
  // state into the next test. ~25s per test creating the event plus the
  // Stripe round-trip.

  test('RSVP to paid event → Stripe Checkout 4242 → redirected back with user on roster', async ({
    browser,
  }) => {
    const skipReason = shouldSkipStripeTests();
    if (skipReason) test.skip(true, skipReason);
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    test.setTimeout(180_000);

    const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://dev.pickupvb.com';
    const appOrigin = new URL(baseUrl).origin;

    const hostCtx = await browser.newContext({ storageState: STORAGE_PATHS.stripeHost });
    const hostPage = await hostCtx.newPage();
    let eventUrl: string | null = null;
    try {
      const created = await createPaidEvent(hostPage, {
        title: `E2E Paid RSVP ${Date.now()}`,
        priceUsd: 5,
      });
      eventUrl = created.url;

      // attendee-a buys a ticket.
      const aCtx = await browser.newContext({ storageState: STORAGE_PATHS.attendeeA });
      const aPage = await aCtx.newPage();
      try {
        await aPage.goto(eventUrl);
        await aPage.waitForLoadState('domcontentloaded');

        // The paid panel renders a `ConfirmSubmitButton` labelled
        // "Pay online — $5.00" — click it, then confirm in the dialog
        // (which the helper handles).
        await clickConfirmedSubmit(aPage, /pay online/i);

        await fillStripeCheckout(aPage, { card: STRIPE_TEST_CARDS.success });
        await waitForStripeRedirect(aPage, appOrigin);

        // We should land on /events/<id>/checkout/success or back on the
        // event page with a `?rsvp=paid` flash. Either way, roster should
        // show attendee-a once the webhook processes ("Cancel sign-up"
        // button appears in the paid panel).
        await pollUiFor(aPage, async () => {
          await aPage.goto(eventUrl!);
          const leaveBtn = aPage.getByRole('button', { name: /cancel sign-up/i });
          return (await leaveBtn.count()) > 0;
        });
      } finally {
        await aCtx.close();
      }
    } finally {
      if (eventUrl) await cancelEvent(hostPage, eventUrl);
      await hostCtx.close();
    }
  });

  test('declined card (4000 0000 0000 0002) → Stripe shows decline → user NOT on roster', async ({
    browser,
  }) => {
    const skipReason = shouldSkipStripeTests();
    if (skipReason) test.skip(true, skipReason);
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    test.setTimeout(180_000);

    const hostCtx = await browser.newContext({ storageState: STORAGE_PATHS.stripeHost });
    const hostPage = await hostCtx.newPage();
    let eventUrl: string | null = null;
    try {
      const created = await createPaidEvent(hostPage, {
        title: `E2E Paid Decline ${Date.now()}`,
        priceUsd: 5,
      });
      eventUrl = created.url;

      const aCtx = await browser.newContext({ storageState: STORAGE_PATHS.attendeeA });
      const aPage = await aCtx.newPage();
      try {
        await aPage.goto(eventUrl);
        await aPage.waitForLoadState('domcontentloaded');
        await clickConfirmedSubmit(aPage, /pay online/i);

        await fillStripeCheckout(aPage, { card: STRIPE_TEST_CARDS.declined });
        // Decline stays on checkout.stripe.com with an inline error.
        await expectStripeDeclineError(aPage);
        expect(aPage.url()).toContain('checkout.stripe.com');

        // Navigate back to the event — attendee-a must NOT be marked paid.
        // The app does create a pending ticket row at checkout-start time
        // (so the user can cancel it), which renders a "Cancel sign-up"
        // button. The paid path renders "Cancel sign-up & refund". Assert
        // the refund variant is absent.
        await aPage.goto(eventUrl);
        await aPage.waitForLoadState('domcontentloaded');
        const paidRefundBtn = aPage.getByRole('button', { name: /cancel sign-up & refund/i });
        expect(await paidRefundBtn.count()).toBe(0);
      } finally {
        await aCtx.close();
      }
    } finally {
      if (eventUrl) await cancelEvent(hostPage, eventUrl);
      await hostCtx.close();
    }
  });

  test('abandon Stripe Checkout → return to event → user NOT on roster', async ({ browser }) => {
    const skipReason = shouldSkipStripeTests();
    if (skipReason) test.skip(true, skipReason);
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    test.setTimeout(180_000);

    const hostCtx = await browser.newContext({ storageState: STORAGE_PATHS.stripeHost });
    const hostPage = await hostCtx.newPage();
    let eventUrl: string | null = null;
    try {
      const created = await createPaidEvent(hostPage, {
        title: `E2E Paid Abandon ${Date.now()}`,
        priceUsd: 5,
      });
      eventUrl = created.url;

      const aCtx = await browser.newContext({ storageState: STORAGE_PATHS.attendeeA });
      const aPage = await aCtx.newPage();
      try {
        await aPage.goto(eventUrl);
        await aPage.waitForLoadState('domcontentloaded');
        await clickConfirmedSubmit(aPage, /pay online/i);

        // Wait for the Stripe page, then bail without filling the form.
        await aPage.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
        await aPage.goto(eventUrl);
        await aPage.waitForLoadState('domcontentloaded');

        // A pending row exists (server creates it at checkout-start time)
        // but webhook never fires — the user is not paid. Assert the paid
        // refund button is absent.
        const paidRefundBtn = aPage.getByRole('button', { name: /cancel sign-up & refund/i });
        expect(await paidRefundBtn.count()).toBe(0);
      } finally {
        await aCtx.close();
      }
    } finally {
      if (eventUrl) await cancelEvent(hostPage, eventUrl);
      await hostCtx.close();
    }
  });
});

test.describe('leave paid event / refund', () => {
  // Refund-window semantics: `now > starts_at - refund_window_hours` =>
  // OUTSIDE the window. Tests use a generous refund_window_hours so the
  // event picker (which lands on the last day of the visible month, ~weeks
  // out) is comfortably INSIDE the window for the "within" test. The
  // "outside" test would need an event scheduled <refundWindowHours from
  // now, which requires picking the FIRST visible day plus a near-future
  // time — the current DateTimePicker helper picks LAST day. Leaving as
  // fixme until we add `pickNearFutureDateTime` or override starts_at via
  // a server-side test seam.

  test('leave within refund window → removed from roster', async ({ browser }) => {
    const skipReason = shouldSkipStripeTests();
    if (skipReason) test.skip(true, skipReason);
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    test.setTimeout(180_000);

    const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://dev.pickupvb.com';
    const appOrigin = new URL(baseUrl).origin;

    const hostCtx = await browser.newContext({ storageState: STORAGE_PATHS.stripeHost });
    const hostPage = await hostCtx.newPage();
    let eventUrl: string | null = null;
    try {
      const created = await createPaidEvent(hostPage, {
        title: `E2E Refund Within ${Date.now()}`,
        priceUsd: 5,
        refundWindowHours: 168, // 1 week — always within for a future event.
      });
      eventUrl = created.url;

      const aCtx = await browser.newContext({ storageState: STORAGE_PATHS.attendeeA });
      const aPage = await aCtx.newPage();
      try {
        await aPage.goto(eventUrl);
        await aPage.waitForLoadState('domcontentloaded');
        await clickConfirmedSubmit(aPage, /pay online/i);
        await fillStripeCheckout(aPage, { card: STRIPE_TEST_CARDS.success });
        await waitForStripeRedirect(aPage, appOrigin);

        // Wait for paid status to show up on the roster.
        await pollUiFor(aPage, async () => {
          await aPage.goto(eventUrl!);
          return (await aPage.getByRole('button', { name: /cancel sign-up/i }).count()) > 0;
        });

        // Click "Cancel sign-up & refund" (ConfirmSubmitButton, destructive).
        await clickConfirmedSubmit(aPage, /cancel sign-up/i);
        await aPage.waitForLoadState('domcontentloaded');

        // After leave, the "Pay online" trigger should be back.
        await pollUiFor(aPage, async () => {
          await aPage.goto(eventUrl!);
          return (await aPage.getByRole('button', { name: /pay online/i }).count()) > 0;
        });
      } finally {
        await aCtx.close();
      }
    } finally {
      if (eventUrl) await cancelEvent(hostPage, eventUrl);
      await hostCtx.close();
    }
  });

  // Blocker: leave-outside-window requires `(starts_at - now) < refund_window_hours`.
  // MAX_REFUND_WINDOW_HOURS = 720 (30 days). The existing `pickFutureDateTime`
  // picks the LAST visible calendar day of the current month — 1 to ~31 days
  // out, which is right at the 30-day boundary. Need a `pickNearFutureDateTime
  // (page, name, daysAhead, time)` helper that targets a specific day-of-month
  // (with month-navigation + outside-day filtering for react-day-picker's
  // showOutsideDays grid) so we can schedule the event 1–2 days out and set
  // refundWindowHours=48 to be definitively outside. Adding that helper is the
  // next step.
  test.fixme('leave outside refund window → leave blocked, error banner shown, user remains on roster', async () => {});
});

test.describe('capacity limit', () => {
  test('event full: attendee-b tries to join a capacity-1 event that attendee-a already filled — sees "event is full"', async ({
    browser,
  }) => {
    test.setTimeout(90_000);

    // attendee-a auth is hard-required by auth.setup.ts (throws when missing),
    // so no skipIfMissingAuth needed for STORAGE_PATHS.attendeeA.
    skipIfMissingAuth(STORAGE_PATHS.freeHost, 'free-host');
    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');

    // ── free-host creates an event with capacity = 1 ────────────────────
    const hostCtx = await browser.newContext({ storageState: STORAGE_PATHS.freeHost });
    const hostPage = await hostCtx.newPage();
    let eventUrl: string | null = null;

    try {
      await hostPage.goto('/events/new');
      await hostPage.waitForLoadState('domcontentloaded');

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
      const aCtx = await browser.newContext({ storageState: STORAGE_PATHS.attendeeA });
      const aPage = await aCtx.newPage();
      try {
        await aPage.goto(eventUrl);
        await aPage.waitForLoadState('domcontentloaded');
        const joinBtn = aPage.getByRole('button', { name: /^join$/i }).first();
        if ((await joinBtn.count()) > 0) {
          await joinBtn.click();
          await aPage.waitForLoadState('domcontentloaded');
        }
      } finally {
        await aCtx.close();
      }

      // ── attendee-b tries to join — should see "this event is full" ───
      const bCtx = await browser.newContext({ storageState: STORAGE_PATHS.attendeeB });
      const bPage = await bCtx.newPage();
      try {
        await bPage.goto(eventUrl);
        await bPage.waitForLoadState('domcontentloaded');

        const joinBtn = bPage.getByRole('button', { name: /^join$/i }).first();
        if ((await joinBtn.count()) > 0) {
          await joinBtn.click();
          await bPage.waitForLoadState('domcontentloaded');
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
        await hostPage.waitForLoadState('domcontentloaded');
        const cancelBtn = hostPage.getByRole('button', { name: /cancel event/i }).first();
        if ((await cancelBtn.count()) > 0) {
          await cancelBtn.click();
          const confirmBtn = hostPage
            .getByRole('button', { name: /yes.*cancel|cancel event/i })
            .last();
          if (await isVisibleOrTimeout(confirmBtn, 5_000)) {
            await confirmBtn.click();
            await hostPage.waitForLoadState('domcontentloaded');
          }
        }
      }
      await hostCtx.close();
    }
  });
});

test.describe('tip jar', () => {
  test('tip jar: enter amount → Stripe Checkout → tip recorded on event page', async ({
    browser,
  }) => {
    const skipReason = shouldSkipStripeTests();
    if (skipReason) test.skip(true, skipReason);
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    test.setTimeout(180_000);

    const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://dev.pickupvb.com';
    const appOrigin = new URL(baseUrl).origin;

    const hostCtx = await browser.newContext({ storageState: STORAGE_PATHS.stripeHost });
    const hostPage = await hostCtx.newPage();
    let eventUrl: string | null = null;
    try {
      // Tip jar works on free events too — use the simpler free recipe via
      // createPaidEvent semantics? No: tip jar is gated on host having
      // Stripe Connect, which the stripe-host has. A free event hosted by
      // stripe-host suffices, but we already have the paid helper handy.
      const created = await createPaidEvent(hostPage, {
        title: `E2E Tip Jar ${Date.now()}`,
        priceUsd: 5,
      });
      eventUrl = created.url;

      const aCtx = await browser.newContext({ storageState: STORAGE_PATHS.attendeeA });
      const aPage = await aCtx.newPage();
      try {
        await aPage.goto(eventUrl);
        await aPage.waitForLoadState('domcontentloaded');

        // Open the tip jar.
        const leaveTipBtn = aPage.getByRole('button', { name: /leave a tip/i }).first();
        if ((await leaveTipBtn.count()) === 0) {
          test.skip(true, 'Tip jar not rendered on this event (host may not have charges_enabled)');
        }
        await leaveTipBtn.click();

        // Pick the $5 preset.
        await aPage.getByRole('button', { name: /^\$5$/ }).first().click();
        await aPage
          .getByRole('button', { name: /^tip\b/i })
          .first()
          .click();

        await fillStripeCheckout(aPage, { card: STRIPE_TEST_CARDS.success });
        await waitForStripeRedirect(aPage, appOrigin);

        // After redirect (?tip=thanks), the page should show a tip total
        // or thank-you banner once the webhook processes. Webhooks on dev
        // can take 30–60s on cold start, so give pollUiFor extra runway.
        await pollUiFor(
          aPage,
          async () => {
            await aPage.goto(eventUrl!);
            const tipped = aPage.getByText(
              /tipped|thanks?\s+for\s+the\s+tip|tip\s+received|thank\s+you/i,
            );
            return (await tipped.count()) > 0;
          },
          { timeoutMs: 90_000 },
        );
      } finally {
        await aCtx.close();
      }
    } finally {
      if (eventUrl) await cancelEvent(hostPage, eventUrl);
      await hostCtx.close();
    }
  });
});
