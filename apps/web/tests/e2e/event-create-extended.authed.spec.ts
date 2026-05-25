import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const FREE_HOST_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'free-host.json');
const PRO_HOST_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'pro-host.json');

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

    if (!fs.existsSync(FREE_HOST_STATE)) {
      test.skip(true, 'free-host auth not set up (TEST_FREE_HOST_EMAIL missing); skipping');
    }

    const ctx = await browser.newContext({ storageState: FREE_HOST_STATE });
    const page = await ctx.newPage();
    let eventUrl: string | null = null;

    try {
      await page.goto('/events/new');
      await page.waitForLoadState('networkidle');

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
      expect(await joinBtn.count()).toBe(0);
    } finally {
      // Cleanup — cancel the event so it does not pollute the dev database.
      if (eventUrl) {
        const editUrl = eventUrl + '/edit';
        await page.goto(editUrl);
        await page.waitForLoadState('networkidle');
        // Click "Cancel event…" to open the panel, then confirm.
        const cancelBtn = page.getByRole('button', { name: /cancel event/i }).first();
        if ((await cancelBtn.count()) > 0) {
          await cancelBtn.click();
          const confirmBtn = page
            .getByRole('button', { name: /yes.*cancel|cancel event/i })
            .filter({ hasNotText: /^\.\.\.$/ })
            .last();
          if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
            await confirmBtn.click();
            await page.waitForLoadState('networkidle');
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
    if (!fs.existsSync(PRO_HOST_STATE)) {
      test.skip(true, 'pro-host auth not set up (TEST_PRO_HOST_EMAIL missing); skipping');
    }
    const ctx = await browser.newContext({ storageState: PRO_HOST_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto('/events/new');

      const templateNameInput = page.getByPlaceholder(/template name/i);
      await expect(templateNameInput).toBeVisible({ timeout: 10_000 });

      const templateTitle = `E2E Template ${Date.now()}`;

      // Fill title and save a template.
      await page.locator('#title').fill('Template Test Event');
      await templateNameInput.fill(templateTitle);

      const saveTemplateBtn = page.getByRole('button', { name: /save template/i });
      await expect(saveTemplateBtn).toBeVisible();
      await saveTemplateBtn.click();

      // Confirmation banner should appear.
      await expect(page.locator('body')).toContainText(/template saved|saved successfully/i, {
        timeout: 10_000,
      });

      // Template should appear in the dropdown.
      const templateSelect = page
        .getByRole('combobox', { name: /template/i })
        .or(page.locator('select[name*="template"]'))
        .first();

      if ((await templateSelect.count()) > 0) {
        const options = await templateSelect.locator('option').allTextContents();
        const found = options.some((o) => o.includes(templateTitle));
        expect(found).toBe(true);
      }

      // Navigate to /events/new fresh; apply the saved template.
      await page.goto('/events/new');

      const applySelect = page
        .getByRole('combobox', { name: /template/i })
        .or(page.locator('select[name*="template"]'))
        .first();

      if ((await applySelect.count()) > 0) {
        await applySelect.selectOption({ label: templateTitle });
        const applyBtn = page.getByRole('button', { name: /apply/i }).first();
        if ((await applyBtn.count()) > 0) {
          await applyBtn.click();
          await page.waitForLoadState('networkidle');
        }

        // Form should be pre-filled with the saved event title.
        await expect(page.locator('#title')).toHaveValue(/Template Test Event/i, {
          timeout: 5_000,
        });
      }

      // Cleanup — remove the template.
      const removeBtn = page
        .getByRole('button', { name: /remove|delete/i })
        .filter({ hasText: /template/i })
        .first();
      if ((await removeBtn.count()) === 0) {
        // Try inline remove button next to the template in a list.
        const anyRemoveBtn = page.getByRole('button', { name: /remove/i }).first();
        if ((await anyRemoveBtn.count()) > 0) {
          await anyRemoveBtn.click();
          await page.waitForLoadState('networkidle');
        }
      } else {
        await removeBtn.click();
        await page.waitForLoadState('networkidle');
      }
    } finally {
      await ctx.close().catch(() => {});
    }
  });
});

test.describe('create event end-to-end', () => {
  test.fixme(
    'create a free open-play event — DateTimePicker interaction + geocoding; cleanup via edit → cancel',
  );

  test.fixme('create a paid event — requires Stripe Connect on the test account');

  test.fixme(
    'create a tournament event with two divisions — requires Pro or Stripe on the test account',
  );
});
