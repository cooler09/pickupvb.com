import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Signs the stripe-host test user in and caches the session.
 * Stripe-host has completed Stripe Connect onboarding (charges_enabled = true)
 * and can create paid events, receive payouts, and access the earnings page.
 *
 * Required env vars (both must be set or setup is skipped):
 *   TEST_STRIPE_HOST_EMAIL  — email of the stripe-host pre-seeded account
 *   TEST_USER_PASSWORD      — shared password for all test accounts
 */
const STORAGE_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'stripe-host.json');

setup('authenticate stripe-host', async ({ page }) => {
  const email = process.env.TEST_STRIPE_HOST_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    setup.skip(
      true,
      'TEST_STRIPE_HOST_EMAIL / TEST_USER_PASSWORD not set; skipping stripe-host auth setup',
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
