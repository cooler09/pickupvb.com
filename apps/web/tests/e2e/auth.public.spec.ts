import { test, expect } from '@playwright/test';

/**
 * Authentication — public-facing form behavior.
 * No mutations; covers form edges not tested in smoke.public.spec.ts.
 */

test.describe('auth forms', () => {
  test('login page has sign-up toggle and shows both modes', async ({ page }) => {
    await page.goto('/login');
    // The page should have a way to switch to sign-up mode.
    const signUpToggle = page
      .getByRole('button', { name: /sign up|create account|register/i })
      .or(page.getByRole('link', { name: /sign up|create account|register/i }))
      .first();
    await expect(signUpToggle).toBeVisible();
  });

  test('wrong-password error stays on /login without crashing', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto('/login');
    await page.getByLabel(/email/i).fill('not-a-real-user@pickupvb-e2e.invalid');
    await page.getByLabel(/password/i).fill('wrongpassword123');
    const form = page.locator('form').filter({ has: page.getByLabel(/password/i) });
    await form.getByRole('button', { name: /sign in|log in|create account/i }).click();

    // Should stay on the login page and show an error — not redirect, not crash.
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('body')).toContainText(
      /invalid|incorrect|wrong|not found|error|try again/i,
    );
    expect(errors).toEqual([]);
  });

  test('forgot-password page has email field and shows confirmation after submit', async ({
    page,
  }) => {
    const response = await page.goto('/forgot-password');
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByLabel(/email/i)).toBeVisible();

    await page.getByLabel(/email/i).fill('no-such-user@pickupvb-e2e.invalid');
    await page.getByRole('button', { name: /send|reset|submit/i }).click();
    await page.waitForLoadState('domcontentloaded');

    // Should show a neutral confirmation — not reveal whether the email exists.
    await expect(page.locator('body')).toContainText(
      /check your email|reset link|if.*account|sent|instructions/i,
    );
  });

  test('visiting a protected page redirects to /login with ?next= param', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login/);
    // The ?next= parameter should be present so the user lands back after sign-in.
    expect(page.url()).toContain('next');
  });
});
