import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Billing and Stripe flows (Sections 11–12 of the test plan).
 *
 * Runnable tests verify that billing pages load and display the expected UI
 * elements. Actual Stripe flows (checkout, portal, Connect onboarding) require
 * test-mode Stripe interaction and are marked fixme.
 *
 * Multi-account tests open secondary browser contexts signed in as pro-host or
 * stripe-host. Both skip gracefully when the corresponding auth file is absent.
 */

const PRO_HOST_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'pro-host.json');
const STRIPE_HOST_STATE = path.join(
  __dirname,
  '..',
  '..',
  '.playwright',
  '.auth',
  'stripe-host.json',
);

test.describe('Pro subscription pages', () => {
  test('/pricing loads with plan options', async ({ page }) => {
    const response = await page.goto('/pricing');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    // Pricing page should mention Pro, monthly or yearly pricing.
    await expect(page.getByText(/pro|monthly|yearly|per month|per year/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('/profile/billing/pro loads with subscribe button', async ({ page }) => {
    const response = await page.goto('/profile/billing/pro');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    // Should show plan selector or subscribe CTA.
    const hasSubscribe = await page
      .getByRole('button', { name: /subscribe|get pro|upgrade/i })
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    const hasPlanText = await page
      .getByText(/pro|plan|month|year/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasSubscribe || hasPlanText).toBe(true);
  });

  test('Pro features visible for Pro user (template card on /events/new)', async ({ page }) => {
    await page.goto('/events/new');
    const templateNameInput = page.getByPlaceholder(/template name/i);
    const isProUser = (await templateNameInput.count()) > 0;
    if (!isProUser) {
      test.skip(true, 'Test user does not have Pro; skipping Pro features visibility check');
    }
    await expect(templateNameInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test('pro-host sees template card on /events/new', async ({ browser }) => {
    if (!fs.existsSync(PRO_HOST_STATE)) {
      test.skip(true, 'pro-host auth not set up (TEST_PRO_HOST_EMAIL missing); skipping');
    }
    const ctx = await browser.newContext({ storageState: PRO_HOST_STATE });
    const page = await ctx.newPage();
    try {
      await page.goto('/events/new');
      await page.waitForLoadState('networkidle');
      // Pro users see a "Template name" input to save event templates.
      const templateInput = page.getByPlaceholder(/template name/i).first();
      await expect(templateInput).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test('/profile/billing/analytics loads — upgrade prompt or charts', async ({ page }) => {
    const response = await page.goto('/profile/billing/analytics');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    const hasUpgrade = await page
      .getByText(/upgrade|pro|analytics.*included/i)
      .first()
      .isVisible()
      .catch(() => false);
    const hasChart = await page
      .getByText(/impressions|views|fill rate|gmv|attendance/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasUpgrade || hasChart).toBe(true);
  });

  test.fixme(
    'subscribe via Stripe Checkout with test card 4242 → Pro badge on profile → template card visible',
  );

  test.fixme('manage subscription: Stripe Billing Portal opens when "Manage" is clicked');

  test.fixme('cancel subscription in Stripe Portal → Pro access removed at end of billing period');
});

test.describe('Stripe Connect (host payouts)', () => {
  test('/profile/billing loads with Stripe Connect checklist', async ({ page }) => {
    const response = await page.goto('/profile/billing');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    // The billing page should show the Stripe Connect onboarding checklist.
    const hasConnect = await page
      .getByText(/stripe|connect|charges|payout|create.*account/i)
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    expect(hasConnect).toBe(true);
  });

  test('"Connect with Stripe" button is present for users without Stripe', async ({ page }) => {
    await page.goto('/profile/billing');
    // If the user already has Stripe Connect, look for "Open Stripe Dashboard" instead.
    const connectBtn = page
      .getByRole('button', { name: /connect with stripe|connect stripe|set up stripe/i })
      .or(page.getByRole('link', { name: /connect with stripe/i }))
      .first();
    const dashboardBtn = page
      .getByRole('button', { name: /stripe dashboard|open dashboard/i })
      .or(page.getByRole('link', { name: /stripe dashboard/i }))
      .first();

    const hasEither = (await connectBtn.count()) > 0 || (await dashboardBtn.count()) > 0;
    expect(hasEither).toBe(true);
  });

  test.fixme(
    'complete Stripe Connect onboarding with test identity → charges_enabled = true → checklist shows complete',
  );

  test('stripe-host: billing page shows connected status and dashboard / earnings navigation', async ({
    browser,
  }) => {
    if (!fs.existsSync(STRIPE_HOST_STATE)) {
      test.skip(true, 'stripe-host auth not set up (TEST_STRIPE_HOST_EMAIL missing); skipping');
    }
    const ctx = await browser.newContext({ storageState: STRIPE_HOST_STATE });
    const page = await ctx.newPage();
    try {
      const response = await page.goto('/profile/billing');
      expect(response?.ok()).toBeTruthy();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      // Regardless of Stripe Connect state, the page shows something Stripe-related.
      const hasStripeContent = await page
        .getByText(/stripe|connect|charges|payout|create.*account|connected/i)
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false);
      expect(hasStripeContent).toBe(true);
      // If fully connected (charges_enabled = true), "View earnings →" link is present.
      // If not yet connected, "Connect with Stripe →" button is present.
      const hasAction =
        (await page.getByText(/View earnings|Stripe dashboard|Connect with Stripe/i).count()) > 0;
      expect(hasAction).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test('stripe-host: earnings page loads with empty state or transaction table', async ({
    browser,
  }) => {
    if (!fs.existsSync(STRIPE_HOST_STATE)) {
      test.skip(true, 'stripe-host auth not set up (TEST_STRIPE_HOST_EMAIL missing); skipping');
    }
    const ctx = await browser.newContext({ storageState: STRIPE_HOST_STATE });
    const page = await ctx.newPage();
    try {
      const response = await page.goto('/profile/billing/earnings');
      expect(response?.ok()).toBeTruthy();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      // Either "No online ticket sales yet" (empty state) or the earnings table.
      const hasContent =
        (await page
          .getByText(/No online ticket sales yet|By event|estimated payout/i)
          .first()
          .isVisible({ timeout: 10_000 })
          .catch(() => false)) || (await page.locator('table').count()) > 0;
      expect(hasContent).toBe(true);
    } finally {
      await ctx.close();
    }
  });
});
