import { test, expect } from '@playwright/test';

/**
 * Billing and Stripe flows (Sections 11–12 of the test plan).
 *
 * Runnable tests verify that billing pages load and display the expected UI
 * elements. Actual Stripe flows (checkout, portal, Connect onboarding) require
 * test-mode Stripe interaction and are marked fixme.
 */

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

  test.fixme(
    '"Open Stripe Dashboard" link redirects to Stripe express dashboard (opens in new tab)',
  );

  test.fixme(
    '/profile/billing/earnings shows transaction list with gross/fee/net totals for hosts with processed payments',
  );
});
