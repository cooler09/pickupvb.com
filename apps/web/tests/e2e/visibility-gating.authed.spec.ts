import { test, expect, type Page } from '@playwright/test';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { cancelEvent, createFreeOpenPlayEvent } from './_helpers/event-create';

/**
 * Visibility Pro gating (audit P1 #1 sub-item #4, shipped Bundle 99).
 *
 * UI mirror of the server-side clamp in apps/web/src/lib/visibility.ts
 * (`clampVisibilityForHost`) — covered by unit tests in
 * visibility.test.ts. These specs assert the rendered <select
 * id="visibility"> state on the /edit page:
 *   - Free host  → disabled, pinned to "public", "(Pro)" label + upgrade nudge.
 *   - Pro host   → enabled, accepts "invite_only".
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

test.describe('visibility — Pro gating on /edit', () => {
  test('free host: visibility select is disabled, pinned to public, with Pro nudge', async ({
    browser,
  }) => {
    skipIfMissingAuth(STORAGE_PATHS.freeHost, 'free-host');
    test.setTimeout(EDIT_TIMEOUT_MS);

    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.freeHost });
    const page = await ctx.newPage();
    let eventUrl: string | null = null;
    try {
      const created = await createFreeOpenPlayEvent(page, {
        title: `E2E Visibility Gate Free ${Date.now()}`,
      });
      eventUrl = created.url;
      await gotoEdit(page, eventUrl);

      const field = page.locator('#visibility');
      await expect(field).toBeVisible({ timeout: 5_000 });
      await expect(field).toBeDisabled();
      await expect(field).toHaveValue('public');

      // Label carries "(Pro)" badge and the helper text links to /pricing.
      await expect(page.locator('label[for="visibility"]')).toContainText(/\(Pro\)/);
      await expect(page.getByRole('link', { name: /upgrade to pro/i })).toBeVisible();
    } finally {
      if (eventUrl) await cancelEvent(page, eventUrl);
      await ctx.close().catch(() => {});
    }
  });

  test('pro host: visibility select is enabled and accepts invite_only', async ({ browser }) => {
    skipIfMissingAuth(STORAGE_PATHS.proHost, 'pro-host');
    test.setTimeout(EDIT_TIMEOUT_MS);

    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.proHost });
    const page = await ctx.newPage();
    let eventUrl: string | null = null;
    try {
      const created = await createFreeOpenPlayEvent(page, {
        title: `E2E Visibility Gate Pro ${Date.now()}`,
      });
      eventUrl = created.url;
      await gotoEdit(page, eventUrl);

      const field = page.locator('#visibility');
      await expect(field).toBeVisible({ timeout: 5_000 });
      await expect(field).toBeEnabled();

      await field.selectOption('invite_only');
      await expect(field).toHaveValue('invite_only');

      // No Pro nudge for Pro hosts.
      await expect(page.locator('label[for="visibility"]')).not.toContainText(/\(Pro\)/);
    } finally {
      if (eventUrl) await cancelEvent(page, eventUrl);
      await ctx.close().catch(() => {});
    }
  });
});
