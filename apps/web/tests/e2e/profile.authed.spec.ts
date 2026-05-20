import { test, expect } from '@playwright/test';

/**
 * Authenticated smoke. Uses the storageState produced by `auth.setup.ts`.
 * Focuses on the surfaces that only render for signed-in users and would
 * silently regress without coverage.
 */

test.describe('authed smoke', () => {
  test('profile page loads and shows the user identity', async ({ page }) => {
    const response = await page.goto('/profile');
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/profile$/);
    // ProfileForm renders a "Display name" or "Handle" field for the signed-in
    // user. Look for either a heading or one of the canonical labels.
    const profileMarker = page.getByText(/display name|handle|your profile/i).first();
    await expect(profileMarker).toBeVisible();
  });

  test('billing checklist page renders the three Stripe steps', async ({ page }) => {
    const response = await page.goto('/profile/billing');
    expect(response?.ok()).toBeTruthy();
    // Three checklist steps from the recent billing redesign.
    await expect(page.getByText(/create.*account/i).first()).toBeVisible();
    await expect(page.getByText(/submit.*details/i).first()).toBeVisible();
    await expect(page.getByText(/enable charges|payouts/i).first()).toBeVisible();
  });

  test('host event entry point is reachable', async ({ page }) => {
    const response = await page.goto('/events/new');
    // Either renders the host form OR redirects to a pricing/upgrade page —
    // both are valid outcomes; we just verify it didn't 500 or bounce to login.
    expect(response?.ok()).toBeTruthy();
    expect(page.url()).not.toMatch(/\/login/);
  });

  test('events browse "following" tab loads for signed-in users', async ({ page }) => {
    const response = await page.goto('/events?when=following');
    expect(response?.ok()).toBeTruthy();
    // Either a list, an empty-state with a follow CTA, or a tab control.
    await expect(page.locator('main')).toContainText(/following|follow|no events|upcoming/i);
  });

  test('sign out returns the user to a public state', async ({ page }) => {
    await page.goto('/profile');
    // Sign-out button lives in the header (desktop) or mobile menu.
    const signOut = page.getByRole('button', { name: /sign out/i }).first();
    if (!(await signOut.isVisible().catch(() => false))) {
      // Open the mobile menu trigger if the header button is hidden.
      const menu = page.getByRole('button', { name: /menu|account|profile/i }).first();
      if (await menu.isVisible().catch(() => false)) await menu.click();
    }
    await page
      .getByRole('button', { name: /sign out/i })
      .first()
      .click();
    // After sign-out, /profile should redirect to /login.
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login/);
  });
});
