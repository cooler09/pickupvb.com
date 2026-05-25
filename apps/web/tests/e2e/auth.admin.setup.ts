import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Signs the admin test user in and caches the session.
 * The admin account must have the `is_admin` flag set in Supabase
 * (via the `platform_admins` table or equivalent). Admin users can
 * hide/unhide community listings, approve claims, and moderate content.
 *
 * Required env vars (both must be set or setup is skipped):
 *   TEST_ADMIN_EMAIL    — email of the admin pre-seeded account
 *   TEST_USER_PASSWORD  — shared password for all test accounts
 */
const STORAGE_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'admin.json');

setup('authenticate admin', async ({ page }) => {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    setup.skip(true, 'TEST_ADMIN_EMAIL / TEST_USER_PASSWORD not set; skipping admin auth setup');
    return;
  }

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  const form = page.locator('form').filter({ has: page.getByLabel(/password/i) });
  await form.getByRole('button', { name: /sign in|log in|create account/i }).click();
  await page.waitForURL(/\/events(\b|$)/, { timeout: 15_000 });
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/profile/);
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
