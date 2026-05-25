import { test, expect } from '@playwright/test';

/**
 * Event browse — public filter behavior. Fills test plan §14.1 ("Event Browse
 * and Filter") with URL-driven, read-only checks. No auth, no mutations.
 *
 * Strategy: the /events page reads `surface`, `skillBand`, `type` and other
 * filter values from the URL searchParams (see apps/web/src/app/events/page.tsx).
 * We can verify the filter narrowing by navigating directly to a filtered URL
 * and asserting the active-filter chip is visible. Counting cards is too
 * brittle (depends on live dev data) so we rely on the in-page filter UI.
 */

test.describe('events browse — public filters', () => {
  test('loads /events without auth and shows event filter form', async ({ page }) => {
    const response = await page.goto('/events');
    expect(response?.ok(), `/events returned ${response?.status()}`).toBeTruthy();

    // The page should render the filter form (server-rendered).
    const filterForm = page
      .locator('form')
      .filter({ has: page.locator('select, [role="combobox"]') })
      .first();
    await expect(filterForm).toBeVisible();
  });

  test('?surface=indoor shows an active filter chip', async ({ page }) => {
    await page.goto('/events?surface=indoor');
    await page.waitForLoadState('networkidle');

    // ActiveFilterChips wraps the chip in a Link with aria-label
    // "Remove filter <label>" — uniquely identifies the chip vs the dropdown option.
    const indoorChip = page.getByRole('link', { name: /remove filter indoor/i });
    await expect(indoorChip).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
  });

  test('?skillBand=intermediate shows an active skill filter chip', async ({ page }) => {
    await page.goto('/events?skillBand=intermediate');
    await page.waitForLoadState('networkidle');

    const skillChip = page.getByRole('link', { name: /remove filter intermediate/i });
    await expect(skillChip).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
  });

  test('combined filters ?surface=indoor&skillBand=intermediate render without crashing', async ({
    page,
  }) => {
    const response = await page.goto('/events?surface=indoor&skillBand=intermediate');
    expect(response?.ok(), `filtered /events returned ${response?.status()}`).toBeTruthy();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /remove filter indoor/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /remove filter intermediate/i })).toBeVisible();
    // "Clear all" appears when 2+ chips are active.
    await expect(page.getByRole('link', { name: /clear all/i })).toBeVisible();
  });

  test('invalid filter values are ignored, page still loads', async ({ page }) => {
    // The page's `pick()` helper drops values not in the allow-list.
    const response = await page.goto('/events?surface=NotARealSurface&skillBand=ZZ');
    expect(response?.ok()).toBeTruthy();
    // No chips should be visible since both values were dropped.
    await expect(page.locator('[aria-label^="Remove filter"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
  });
});
