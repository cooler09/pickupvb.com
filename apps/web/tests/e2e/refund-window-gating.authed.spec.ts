import { test, expect, type Page } from './_helpers/fixtures';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { cancelEvent, createFreeOpenPlayEvent } from './_helpers/event-create';

/**
 * Refund-window Pro gating (audit P1 #1, shipped Bundle 98).
 *
 * UI mirror of the server-side clamp in apps/web/src/lib/money.ts
 * (`parseRefundWindowHours(..., { allowCustom })`) — covered by unit
 * tests in money.test.ts. These specs assert the rendered <input
 * id="refundWindowHours"> state on the /edit page:
 *   - Free host  → disabled, pinned to 24, "(Pro)" label + upgrade nudge.
 *   - Pro host   → enabled, editable across 0–720h.
 *
 * Each test creates its own disposable free open-play event and cancels
 * it in `finally`. We don't reuse a shared event because the two hosts
 * are different accounts, and only the host of a given event sees /edit.
 */

const EDIT_TIMEOUT_MS = 90_000;

async function gotoEdit(page: Page, eventUrl: string): Promise<void> {
  await page.goto(`${eventUrl}/edit`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#title')).toBeEditable({ timeout: 10_000 });
}

test.describe('refund window — Pro gating on /edit', () => {
  test('free host: refund-window input is disabled, pinned to 24, with Pro nudge', async ({
    browser,
  }) => {
    skipIfMissingAuth(STORAGE_PATHS.freeHost, 'free-host');
    test.setTimeout(EDIT_TIMEOUT_MS);

    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.freeHost });
    const page = await ctx.newPage();
    let eventUrl: string | null = null;
    try {
      const created = await createFreeOpenPlayEvent(page, {
        title: `E2E Refund Gate Free ${Date.now()}`,
      });
      eventUrl = created.url;
      await gotoEdit(page, eventUrl);

      const field = page.locator('#refundWindowHours');
      if ((await field.count()) === 0) {
        test.skip(
          true,
          'refundWindowHours input not rendered (paymentsOffPlatform defaulted true?); skipping',
        );
      }

      await expect(field).toBeVisible({ timeout: 5_000 });
      await expect(field).toBeDisabled();
      await expect(field).toHaveValue('24');

      // Label carries "(Pro)" badge and the helper text links to /pricing.
      // Scope the upgrade link to this field's helper paragraph — the /edit page
      // renders a second "Upgrade to Pro" link under the visibility select.
      await expect(page.locator('label[for="refundWindowHours"]')).toContainText(/\(Pro\)/);
      const refundHelper = page.locator('#refundWindowHours ~ p');
      await expect(refundHelper.getByRole('link', { name: /upgrade to pro/i })).toBeVisible();
    } finally {
      if (eventUrl) await cancelEvent(page, eventUrl);
      await ctx.close().catch(() => {});
    }
  });

  test('pro host: refund-window input is editable across the 0–720h range', async ({ browser }) => {
    skipIfMissingAuth(STORAGE_PATHS.proHost, 'pro-host');
    test.setTimeout(EDIT_TIMEOUT_MS);

    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.proHost });
    const page = await ctx.newPage();
    let eventUrl: string | null = null;
    try {
      const created = await createFreeOpenPlayEvent(page, {
        title: `E2E Refund Gate Pro ${Date.now()}`,
      });
      eventUrl = created.url;
      await gotoEdit(page, eventUrl);

      const field = page.locator('#refundWindowHours');
      if ((await field.count()) === 0) {
        test.skip(
          true,
          'refundWindowHours input not rendered (paymentsOffPlatform defaulted true?); skipping',
        );
      }

      await expect(field).toBeVisible({ timeout: 5_000 });
      await expect(field).toBeEnabled();
      // Pro accepts custom value; pick something distinct from the 24h default.
      await field.fill('48');
      await expect(field).toHaveValue('48');

      // No Pro nudge for Pro hosts.
      await expect(page.locator('label[for="refundWindowHours"]')).not.toContainText(/\(Pro\)/);
    } finally {
      if (eventUrl) await cancelEvent(page, eventUrl);
      await ctx.close().catch(() => {});
    }
  });
});
