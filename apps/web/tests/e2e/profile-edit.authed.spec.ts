import { test, expect, type Page } from '@playwright/test';

/**
 * Authenticated profile-edit flows.
 *
 * Each test restores the state it changes so the test user's profile remains
 * stable across runs. If a test fails mid-run, the changed field may be left
 * in a modified state — clean up manually via the profile page or Supabase
 * dashboard if needed.
 */

/**
 * The edit form lives inside a <details> element that is collapsed by default.
 * This helper expands it if needed so form inputs become visible.
 */
async function openEditForm(page: Page) {
  const summary = page
    .locator('details summary')
    .filter({ hasText: /edit profile/i })
    .first();
  if ((await summary.count()) === 0) return;
  // Read open state via the summary's parent <details> — avoids the nested
  // locator bug where filter({ has: summaryLocator }) evaluates "details summary"
  // relative to each <details> candidate (two levels deep, always zero matches).
  const isOpen = await summary.evaluate((el) => (el.parentElement as HTMLDetailsElement).open);
  if (!isOpen) await summary.click();
  await page
    .locator('input[name="display_name"]')
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 });
}

test.describe('profile form', () => {
  test('profile form loads with name fields visible', async ({ page }) => {
    await page.goto('/profile');
    await openEditForm(page);
    await expect(page.getByLabel(/first.?name/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/last.?name/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/display.?name/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('edit display_name: fill unique value, save, reload, verify persisted', async ({ page }) => {
    await page.goto('/profile');
    await openEditForm(page);
    const displayNameInput = page.locator('input[name="display_name"]').first();
    await expect(displayNameInput).toBeVisible({ timeout: 10_000 });

    // Capture original value for cleanup.
    const originalValue = (await displayNameInput.inputValue()) ?? '';

    const uniqueName = `E2ETest${Date.now()}`;
    await displayNameInput.fill(uniqueName);
    await page.getByRole('button', { name: /save changes/i }).click();
    // Wait for the server action to actually persist — networkidle alone
    // doesn't guarantee the React server action round-trip completed.
    await expect(page.getByText(/profile updated/i).first()).toBeVisible({ timeout: 10_000 });

    // Reload and verify persistence.
    await page.goto('/profile');
    await openEditForm(page);
    await expect(page.locator('input[name="display_name"]').first()).toHaveValue(uniqueName, {
      timeout: 10_000,
    });

    // Cleanup — restore original display name.
    await page.locator('input[name="display_name"]').first().fill(originalValue);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/profile updated/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('edit home_city: fill Virginia Beach, save, reload, verify persisted', async ({ page }) => {
    await page.goto('/profile');
    await openEditForm(page);
    const cityInput = page.locator('input[name="home_city"]').first();
    await expect(cityInput).toBeVisible({ timeout: 10_000 });

    const originalValue = (await cityInput.inputValue()) ?? '';

    await cityInput.fill('Virginia Beach');
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForLoadState('networkidle');

    await page.goto('/profile');
    await openEditForm(page);
    await expect(page.locator('input[name="home_city"]').first()).toHaveValue('Virginia Beach', {
      timeout: 10_000,
    });

    // Cleanup.
    await page.locator('input[name="home_city"]').first().fill(originalValue);
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForLoadState('networkidle');
  });

  test('edit instagram_handle: fill, save, reload, verify, then clear and save', async ({
    page,
  }) => {
    await page.goto('/profile');
    await openEditForm(page);
    const igInput = page.locator('input[name="instagram_handle"]').first();
    await expect(igInput).toBeVisible({ timeout: 10_000 });

    const originalValue = (await igInput.inputValue()) ?? '';

    await igInput.fill('e2etestuser');
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForLoadState('networkidle');

    await page.goto('/profile');
    await openEditForm(page);
    await expect(page.locator('input[name="instagram_handle"]').first()).toHaveValue(
      'e2etestuser',
      { timeout: 10_000 },
    );

    // Cleanup — restore original value.
    await page.locator('input[name="instagram_handle"]').first().fill(originalValue);
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForLoadState('networkidle');
  });
});

test.describe('handle editor', () => {
  test('handle editor is present on profile page', async ({ page }) => {
    await page.goto('/profile');
    // The handle editor renders the URL "/players/<handle>" with a "Change"
    // trigger that swaps the row for an <input name="handle">.
    const handleInput = page.locator('input[name="handle"]').first();
    const playersUrlText = page.getByText(/\/players\//).first();
    const changeBtn = page
      .getByRole('button', { name: /^change$/i })
      .or(page.getByRole('button', { name: /change handle|edit handle/i }))
      .first();
    const handleVisible =
      (await handleInput.count()) > 0 ||
      (await changeBtn.count()) > 0 ||
      (await playersUrlText.count()) > 0;
    expect(handleVisible).toBe(true);
  });

  test('own public profile /players/<handle> loads', async ({ page }) => {
    await page.goto('/profile');

    // Try to find own handle from a link to /players/<handle>.
    const playerLink = page.locator('a[href*="/players/"]').first();
    let profileUrl: string | null = null;

    if ((await playerLink.count()) > 0) {
      profileUrl = await playerLink.getAttribute('href');
    }

    // Fall back: look for handle input value.
    if (!profileUrl) {
      const handleInput = page.locator('input[name="handle"]').first();
      if ((await handleInput.count()) > 0) {
        const handle = await handleInput.inputValue();
        if (handle) profileUrl = `/players/${handle}`;
      }
    }

    if (!profileUrl) {
      test.skip(true, 'Could not determine own handle from profile page; skipping');
    }

    const response = await page.goto(profileUrl!);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('notification preferences', () => {
  test('notifications page loads with toggles', async ({ page }) => {
    const response = await page.goto('/profile/notifications');
    expect(response?.ok()).toBeTruthy();
    // At least one notification toggle should be present.
    const anyToggle = page
      .locator('input[name="in_app_enabled"], input[name="email_enabled"]')
      .first();
    await expect(anyToggle).toBeVisible({ timeout: 10_000 });
  });

  test('toggle email_enabled, save, reload, verify, then restore', async ({ page }) => {
    await page.goto('/profile/notifications');

    const emailToggle = page.locator('input[name="email_enabled"]').first();
    await expect(emailToggle).toBeVisible({ timeout: 10_000 });

    const originalChecked = await emailToggle.isChecked();

    // Toggle the checkbox.
    await emailToggle.click();
    const saveBtn = page.getByRole('button', { name: /save/i }).first();
    if ((await saveBtn.count()) > 0) {
      await saveBtn.click();
    }
    await page.waitForLoadState('networkidle');

    // Reload and verify state changed.
    await page.goto('/profile/notifications');
    const toggleAfter = page.locator('input[name="email_enabled"]').first();
    await expect(toggleAfter).toBeVisible({ timeout: 10_000 });
    const newChecked = await toggleAfter.isChecked();
    expect(newChecked).toBe(!originalChecked);

    // Cleanup — restore original state.
    await toggleAfter.click();
    const saveBtnAgain = page.getByRole('button', { name: /save/i }).first();
    if ((await saveBtnAgain.count()) > 0) {
      await saveBtnAgain.click();
    }
    await page.waitForLoadState('networkidle');
  });
});

test.describe('billing and account pages', () => {
  test('receipts page loads without error', async ({ page }) => {
    const response = await page.goto('/profile/receipts');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
  });

  test('billing page loads with Stripe checklist steps', async ({ page }) => {
    const response = await page.goto('/profile/billing');
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText(/create.*account/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/submit.*details/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/enable charges|payouts/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('analytics page loads — upgrade prompt or charts', async ({ page }) => {
    const response = await page.goto('/profile/billing/analytics');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    // Either shows an upgrade prompt or actual analytics content.
    const hasUpgrade = await page
      .getByText(/upgrade|pro|analytics.*included/i)
      .first()
      .isVisible()
      .catch(() => false);
    const hasAnalytics = await page
      .getByText(/impressions|views|attendance|chart/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasUpgrade || hasAnalytics).toBe(true);
  });

  test('pro page loads with plan options', async ({ page }) => {
    const response = await page.goto('/profile/billing/pro');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    // Should show plan/pricing content.
    await expect(page.getByText(/pro|plan|month|year|upgrade/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
