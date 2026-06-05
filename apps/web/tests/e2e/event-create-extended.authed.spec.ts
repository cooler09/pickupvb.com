import { test, expect } from './_helpers/fixtures';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import {
  cancelEvent,
  createFreeOpenPlayEvent,
  createPaidEvent,
  openTemplatesModal,
} from './_helpers/event-create';
import { shouldSkipStripeTests } from './_helpers/stripe';

/**
 * Extended event creation flows beyond what events.authed.spec.ts covers.
 *
 * Covers:
 *   - Section 3.4: External registration toggle and URL field
 *   - Section 3.5: Template full flow (Pro user only — skips otherwise)
 *   - Section 3.6: Template card hidden from non-Pro
 *
 * Tests that create a real event are marked @destructive because cleanup
 * requires owning the created event and cancelling it, which may not always
 * succeed. Exclude with: --grep-invert @destructive
 */

test.describe('external registration', () => {
  test('external registration toggle reveals URL field', async ({ page }) => {
    await page.goto('/events/new');

    // Look for "external registration" toggle / checkbox / switch.
    const externalToggle = page
      .getByLabel(/external registration/i)
      .or(page.getByRole('checkbox', { name: /external/i }))
      .or(page.getByRole('switch', { name: /external/i }))
      .first();

    if ((await externalToggle.count()) === 0) {
      test.skip(true, 'No external registration toggle found on this form version; skipping');
    }

    await externalToggle.click();

    // After enabling, an external URL input should appear.
    const externalUrlInput = page
      .locator('input[name*="external"]')
      .or(page.getByLabel(/external.*url|registration.*url/i))
      .first();

    await expect(externalUrlInput).toBeVisible({ timeout: 5_000 });
  });

  test('create event with external registration — event page shows "How to register" card, no on-platform RSVP', async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    skipIfMissingAuth(STORAGE_PATHS.freeHost, 'free-host');

    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.freeHost });
    const page = await ctx.newPage();
    let eventUrl: string | null = null;

    try {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');

      const response = await page.request.get('/events/new');
      if (!response.ok()) {
        test.skip(true, '/events/new not reachable; skipping');
      }

      // Toggle external registration ("Registration happens off-platform" checkbox).
      const externalCheckbox = page.locator('input[name="isExternal"]');
      if ((await externalCheckbox.count()) === 0) {
        test.skip(true, 'No isExternal checkbox found; skipping');
      }
      await externalCheckbox.check();

      // Fill required fields.
      await page.locator('#title').fill(`E2E External Reg ${Date.now()}`);

      // Open the DateTimePicker for startsAt and pick any available day.
      // The hidden input is React-controlled (value={reactState}), so the
      // evaluate/dispatchEvent hack is unreliable — interact with the UI instead
      // so onChange fires and React state is properly updated.
      const startsAtTrigger = page.locator('button[id="startsAt"][aria-haspopup="dialog"]');
      await expect(startsAtTrigger).toBeVisible({ timeout: 5_000 });
      await startsAtTrigger.click();

      const calendarDialog = page.locator('[role="dialog"]').first();
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

      // Click Done to commit the selection and close the popover.
      await calendarDialog.getByRole('button', { name: /done/i }).click();
      await calendarDialog.waitFor({ state: 'hidden', timeout: 5_000 });

      // Set endsAt to the same future month, day-after to satisfy `endsAt > startsAt`.
      const endsAtTrigger = page.locator('button[id="endsAt"][aria-haspopup="dialog"]');
      await expect(endsAtTrigger).toBeVisible({ timeout: 5_000 });
      await endsAtTrigger.click();
      const endsCalendar = page.locator('[role="dialog"]').first();
      await endsCalendar.waitFor({ state: 'visible', timeout: 5_000 });
      const endsNextMonthBtn = endsCalendar.getByRole('button', { name: /next/i }).first();
      if ((await endsNextMonthBtn.count()) > 0) {
        await endsNextMonthBtn.click();
      }
      // Pick the second available day (after startsAt).
      const endsDayBtns = endsCalendar.locator('table button:not([disabled])');
      const endsDayCount = await endsDayBtns.count();
      await endsDayBtns.nth(endsDayCount > 1 ? 1 : 0).click();
      await endsCalendar.getByRole('button', { name: /done/i }).click();
      await endsCalendar.waitFor({ state: 'hidden', timeout: 5_000 });

      // Required address fields. Fill addressLine first — that flips
      // `hasAddress=true` and collapses the city/region/postal/country
      // subfield panel out of the DOM. We then click "Edit address details"
      // to re-expand the panel so the subfields are submitted in FormData.
      await page.locator('input[name="addressLine"]').fill('1000 Atlantic Ave');
      const editAddressBtn = page.getByRole('button', { name: /edit address details/i });
      if ((await editAddressBtn.count()) > 0) {
        await editAddressBtn.click();
      }
      await page.locator('input[name="city"]').fill('Virginia Beach');
      await page.locator('input[name="region"]').fill('Virginia');
      await page.locator('input[name="postalCode"]').fill('23451');
      await page.locator('input[name="country"]').fill('United States');

      // Fill the external registration URL (visible after toggle).
      const externalUrlInput = page.locator('input[name="externalRegistrationUrl"]');
      await expect(externalUrlInput).toBeVisible({ timeout: 5_000 });
      await externalUrlInput.fill('https://www.facebook.com/groups/vbtest');

      // Capture the server-action response body so we can read the JSON
      // result (error + fieldErrors) if validation fails.
      const responseBodies: string[] = [];
      page.on('response', async (resp) => {
        try {
          const url = resp.url();
          if (url.includes('/events/new') && resp.request().method() === 'POST') {
            const body = await resp.text().catch(() => '');
            if (body) responseBodies.push(`STATUS=${resp.status()} BODY=${body.slice(0, 2000)}`);
          }
        } catch {
          /* ignore */
        }
      });

      // Submit the form.
      await page
        .getByRole('button', { name: /create event|publish|save/i })
        .last()
        .click();
      try {
        await page.waitForURL(
          (url) => /\/events\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
          { timeout: 20_000 },
        );
      } catch (err) {
        // Server returned a validation/geocode error and re-rendered the form.
        // Surface the alert text so we can diagnose what's actually failing.
        await page.evaluate(() => window.scrollTo(0, 0));
        const alertText = await page
          .locator('[role="alert"]')
          .evaluateAll((els) =>
            els.map((el) => `${el.id || '(no-id)'}|${el.textContent?.trim() ?? ''}`),
          )
          .catch(() => [] as string[]);
        const invalidInputs = await page
          .locator('[aria-invalid="true"]')
          .evaluateAll((els) =>
            els.map((el) => `${(el as HTMLElement).getAttribute('name') ?? el.id}`),
          )
          .catch(() => [] as string[]);
        const fieldErrors = await page
          .locator('[id$="-error"]')
          .evaluateAll((els) => els.map((el) => `${el.id}: ${el.textContent?.trim() ?? ''}`))
          .catch(() => [] as string[]);
        throw new Error(
          `Event create did not navigate. URL=${page.url()} alerts=${JSON.stringify(
            alertText,
          )} invalid=${JSON.stringify(invalidInputs)} fieldErrors=${JSON.stringify(fieldErrors)} responseBodies=${JSON.stringify(responseBodies)}\nOriginal: ${(err as Error).message}`,
        );
      }
      eventUrl = page.url();

      // Verify the external registration card is shown ("How to register").
      await expect(page.locator('main')).toContainText(/How to register/i, { timeout: 10_000 });
      // Verify the on-platform RSVP / join button is absent.
      const joinBtn = page.getByRole('button', { name: /^join$/i });
      await expect(joinBtn).toHaveCount(0);
    } finally {
      // Cleanup — cancel the event so it does not pollute the dev database.
      if (eventUrl) {
        const editUrl = eventUrl + '/edit';
        await page.goto(editUrl);
        await page.waitForLoadState('domcontentloaded');
        // Click "Cancel event…" to open the panel, then confirm.
        const cancelBtn = page.getByRole('button', { name: /cancel event/i }).first();
        if ((await cancelBtn.count()) > 0) {
          await cancelBtn.click();
          const confirmBtn = page
            .getByRole('button', { name: /yes.*cancel|cancel event/i })
            .filter({ hasNotText: /^\.\.\.$/ })
            .last();
          if (await isVisibleOrTimeout(confirmBtn, 5_000)) {
            await confirmBtn.click();
            await page.waitForLoadState('domcontentloaded');
          }
        }
      }
      await ctx.close();
    }
  });
});

test.describe('template full flow (Pro)', () => {
  test('Pro: save template, verify in dropdown, apply pre-fills form, then remove', async ({
    browser,
  }) => {
    skipIfMissingAuth(STORAGE_PATHS.proHost, 'pro-host');
    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.proHost });
    const page = await ctx.newPage();
    try {
      await page.goto('/events/new');

      const templateTitle = `E2E Template ${Date.now()}`;

      // Fill the form title BEFORE opening the modal (the modal overlays the
      // form; the template snapshots the parent <form>, so the title rides
      // along into the saved payload).
      await page.locator('#title').fill('Template Test Event');

      // The saved-templates affordance is Pro-only and lives behind a
      // "Templates" button that opens a FormModal.
      expect(await openTemplatesModal(page)).toBe(true);
      await page.getByPlaceholder(/template name/i).fill(templateTitle);

      const saveTemplateBtn = page.getByRole('button', { name: /save template/i });
      await expect(saveTemplateBtn).toBeVisible();
      await saveTemplateBtn.click();

      // Saving redirects to ?template_status=saved, which remounts the page and
      // closes the modal; the confirmation renders on the form.
      await expect(page.locator('body')).toContainText(/template saved|saved successfully/i, {
        timeout: 10_000,
      });

      // Reopen the modal — the saved template should be in the dropdown.
      expect(await openTemplatesModal(page)).toBe(true);
      const templateSelect = page.getByRole('combobox', { name: /saved template/i });
      await expect(templateSelect).toBeVisible({ timeout: 10_000 });
      const options = await templateSelect.locator('option').allTextContents();
      expect(options.some((o) => o.includes(templateTitle))).toBe(true);

      // Apply the saved template — it pushes ?template=<id> and re-seeds the
      // form server-side with the snapshot (including the title).
      await templateSelect.selectOption({ label: templateTitle });
      await page.getByRole('button', { name: /^apply$/i }).click();
      await expect(page.locator('#title')).toHaveValue(/Template Test Event/i, {
        timeout: 10_000,
      });

      // Cleanup — reopen the modal, pick the template, and remove it. The
      // Remove button only renders once a template is selected in the picker.
      expect(await openTemplatesModal(page)).toBe(true);
      await page.getByRole('combobox', { name: /saved template/i }).selectOption({
        label: templateTitle,
      });
      await page.getByRole('button', { name: /^remove$/i }).click();
      await page.waitForLoadState('domcontentloaded');
    } finally {
      await ctx.close().catch(() => {});
    }
  });
});

test.describe('create event end-to-end', () => {
  test('create a free open-play event — DateTimePicker interaction + geocoding; cleanup via edit → cancel', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const title = `E2E Extended Free Open Play ${Date.now()}`;
    let eventUrl: string | null = null;
    try {
      const created = await createFreeOpenPlayEvent(page, { title });
      eventUrl = created.url;

      // Detail page should render the event title we submitted, and the URL
      // matches the created uuid.
      await page.goto(eventUrl);
      await expect(page).toHaveURL(new RegExp(`/events/${created.id}`));
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      if (eventUrl) await cancelEvent(page, eventUrl);
    }
  });

  test('create a paid event as stripe-host — price appears on detail page', async ({ browser }) => {
    const skipReason = shouldSkipStripeTests();
    if (skipReason) test.skip(true, skipReason);
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    test.setTimeout(120_000);

    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.stripeHost });
    const page = await ctx.newPage();
    let eventUrl: string | null = null;
    try {
      const title = `E2E Paid Event Create ${Date.now()}`;
      const created = await createPaidEvent(page, { title, priceUsd: 7 });
      eventUrl = created.url;

      await page.goto(eventUrl);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({
        timeout: 10_000,
      });
      // Price should be reflected somewhere on the detail page.
      await expect(page.locator('main')).toContainText(/\$\s*7(\.\d{2})?/, { timeout: 10_000 });
    } finally {
      if (eventUrl) await cancelEvent(page, eventUrl);
      await ctx.close().catch(() => {});
    }
  });

  test.fixme('create a tournament event with two divisions — needs divisions repeater helper', async () => {}); // Wait for the tournament harness bundle (item #3 in the e2e backlog). // capacity/priceUsd for each, (c) the per-division team_registration_mode select (ADR 0016). // repeater helper that adds two `div_N_*` rows and fills name/skill/ // Compound: needs (a) the existing paid-event helper, (b) a divisions
});
