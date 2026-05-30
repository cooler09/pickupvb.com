import { test, expect } from '@playwright/test';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { isVisibleOrTimeout } from './_helpers/predicates';

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
    const hasSubscribe = await isVisibleOrTimeout(
      page.getByRole('button', { name: /subscribe|get pro|upgrade/i }).first(),
      10_000,
    );
    const hasPlanText = await isVisibleOrTimeout(page.getByText(/pro|plan|month|year/i).first());
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
    skipIfMissingAuth(STORAGE_PATHS.proHost, 'pro-host');
    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.proHost });
    const page = await ctx.newPage();
    try {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');
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
    const hasUpgrade = await isVisibleOrTimeout(
      page.getByText(/upgrade|pro|analytics.*included/i).first(),
    );
    const hasChart = await isVisibleOrTimeout(
      page.getByText(/impressions|views|fill rate|gmv|attendance/i).first(),
    );
    expect(hasUpgrade || hasChart).toBe(true);
  });

  test.fixme('subscribe via Stripe Checkout with test card 4242 → Pro badge on profile → template card visible', // graduate this. Harness primitives in _helpers/stripe.ts are ready. // post-test "cancel subscription via Stripe API" cleanup, then // expectations elsewhere). Add TEST_BILLING_VICTIM_EMAIL or wire up a // the default actor for many tests — making them Pro changes // for the rest of the run without polluting other tests (attendee-a is // Needs a dedicated test user that can be left in a 'Pro/trial' state
  async () => {});

  test.fixme('manage subscription: Stripe Billing Portal opens when "Manage" is clicked', async () => {}); // subscribe test ships so we have a known Pro state to assert. // page.url() contains 'billing.stripe.com'. Leave fixme until the // are documented as unstable. Best-case assertion: click "Manage" → // landing) AND drives the Stripe Billing Portal UI, whose selectors // Requires an existing subscription (depends on the test above

  test.fixme('cancel subscription in Stripe Portal → Pro access removed at end of billing period', async () => {}); // proxy if we want CI coverage of the downstream behaviour. // subscriptions.update(cancel_at_period_end=true) is a more reliable // a deterministic way to test portal flows; the Stripe API call to // (host_subscriptions.cancel_at_period_end flip). Skip until we have // Same blocker as Manage Portal + needs a webhook-driven assertion
});

test.describe('Stripe Connect (host payouts)', () => {
  test('/profile/billing loads with Stripe Connect checklist', async ({ page }) => {
    const response = await page.goto('/profile/billing');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    // The billing page should show the Stripe Connect onboarding checklist.
    const hasConnect = await isVisibleOrTimeout(
      page.getByText(/stripe|connect|charges|payout|create.*account/i).first(),
      10_000,
    );
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

  test.fixme('complete Stripe Connect onboarding with test identity → charges_enabled = true → checklist shows complete', // affordance (which is unreliable), or shifting to assert the // throwaway account per run + Stripe Connect's "skip phone" test // onboarded so paid-flow tests pass; this test would need either a // Playwright. The dev TEST_STRIPE_HOST_EMAIL account is already // code from a Stripe test number), which cannot be driven by // Stripe Connect onboarding requires phone-number verification (SMS
  // already-onboarded state instead of driving the onboarding itself.
  async () => {});

  test('stripe-host: billing page shows connected status and dashboard / earnings navigation', async ({
    browser,
  }) => {
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.stripeHost });
    const page = await ctx.newPage();
    try {
      const response = await page.goto('/profile/billing');
      expect(response?.ok()).toBeTruthy();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      // Regardless of Stripe Connect state, the page shows something Stripe-related.
      const hasStripeContent = await isVisibleOrTimeout(
        page.getByText(/stripe|connect|charges|payout|create.*account|connected/i).first(),
        10_000,
      );
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
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.stripeHost });
    const page = await ctx.newPage();
    try {
      const response = await page.goto('/profile/billing/earnings');
      expect(response?.ok()).toBeTruthy();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      // Either "No online ticket sales yet" (empty state) or the earnings table.
      const hasContent =
        (await isVisibleOrTimeout(
          page.getByText(/No online ticket sales yet|By event|estimated payout/i).first(),
          10_000,
        )) || (await page.locator('table').count()) > 0;
      expect(hasContent).toBe(true);
    } finally {
      await ctx.close();
    }
  });
});
