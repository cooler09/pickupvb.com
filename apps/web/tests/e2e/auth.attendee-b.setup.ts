import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Signs attendee-b in and caches the session to `.playwright/.auth/attendee-b.json`.
 * Multi-user tests load this as a second browser context alongside the main user.json.
 *
 * Required env vars (both must be set or the setup is skipped):
 *   TEST_ATTENDEE_B_EMAIL  — email of a second pre-seeded user
 *   TEST_USER_PASSWORD     — shared password (same password is fine for dev seeds)
 *
 * If either var is missing the setup is skipped rather than throwing — authed
 * tests that depend on attendee-b check fs.existsSync(ATTENDEE_B_STATE) and
 * call test.skip() gracefully so the rest of the suite keeps running.
 */
const STORAGE_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'attendee-b.json');

setup('authenticate attendee-b', async ({ page }) => {
  const email = process.env.TEST_ATTENDEE_B_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    setup.skip(
      true,
      'TEST_ATTENDEE_B_EMAIL / TEST_USER_PASSWORD not set; skipping attendee-b auth setup',
    );
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
