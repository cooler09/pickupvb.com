import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Signs the test user in once and caches the resulting session to
 * `.playwright/.auth/user.json`. Authed specs reuse this storageState.
 *
 * Required env vars:
 *   TEST_USER_EMAIL     — email of a pre-seeded user
 *   TEST_USER_PASSWORD  — that user's password
 *
 * Treat the test user as scoped to dev/preview only — never use a real
 * production account.
 */
const STORAGE_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'user.json');

setup('authenticate test user', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'TEST_USER_EMAIL and TEST_USER_PASSWORD must be set to run authenticated tests.',
    );
  }

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  // Scope to the credentials form so we don't match the header "Sign in"
  // link or the "Continue with Google" OAuth button.
  const form = page.locator('form').filter({ has: page.getByLabel(/password/i) });
  await form.getByRole('button', { name: /sign in|log in|create account/i }).click();

  // Sign-in redirects to /events on success.
  await page.waitForURL(/\/events(\b|$)/, { timeout: 15_000 });

  // Sanity: hitting /profile should now load (not redirect to /login).
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/profile/);

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
