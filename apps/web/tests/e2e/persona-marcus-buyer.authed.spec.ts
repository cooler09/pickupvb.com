import { test, expect } from './_helpers/fixtures';
import type { Browser } from '@playwright/test';
import { PERSONAS, withPersona, skipIfPersonaMissing } from './_helpers/personas';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { createPaidEvent, cancelEvent } from './_helpers/event-create';
import {
  STRIPE_TEST_CARDS,
  clickConfirmedSubmit,
  expectStripeDeclineError,
  fillStripeCheckout,
  pollUiFor,
  shouldSkipStripeTests,
  waitForStripeRedirect,
} from './_helpers/stripe';

/**
 * Marcus Lee (P14) — the paid-ticket buyer / tipper / refunder.
 * docs/personas.md.
 *
 * Marcus is the money-side player: every Stripe buyer path runs through him.
 * The Stripe-driven tests reuse the test-mode harness (`_helpers/stripe.ts`) and
 * the same webhook bridge as `event-attendance.authed.spec.ts` — a Stripe-Connect
 * host (`stripe-host`) stands up a paid event, Marcus buys/tips through hosted
 * Checkout (`4242`/`4000…0002`), and the test polls the UI for the
 * webhook-driven state. All paid tests `shouldSkipStripeTests()` on localhost or
 * with `SKIP_STRIPE_E2E=1` (a sanctioned infra gate). The persona angle over the
 * cross-cutting versions: assert Marcus's **receipt** and drive the **tip jar**.
 */

const marcus = PERSONAS.marcus;

/**
 * Stand up a paid event under the Stripe-Connect host, run `fn` against it, and
 * always cancel + close in `finally`. Keeps each Stripe test to its buyer-side
 * body. `appOrigin` is derived from `PLAYWRIGHT_BASE_URL` for the post-Checkout
 * redirect assertion.
 */
async function withStripeHostPaidEvent(
  browser: Browser,
  opts: { title: string; priceUsd: number },
  fn: (eventUrl: string, appOrigin: string) => Promise<void>,
): Promise<void> {
  const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://dev.pickupvb.com';
  const appOrigin = new URL(baseUrl).origin;
  const hostCtx = await browser.newContext({ storageState: STORAGE_PATHS.stripeHost });
  const hostPage = await hostCtx.newPage();
  let eventUrl: string | null = null;
  try {
    const created = await createPaidEvent(hostPage, opts);
    eventUrl = created.url;
    await fn(eventUrl, appOrigin);
  } finally {
    if (eventUrl) await cancelEvent(hostPage, eventUrl);
    await hostCtx.close();
  }
}

test.describe(`${marcus.name} (${marcus.id}) — paid-ticket buyer`, () => {
  test('/profile/receipts loads (empty state or receipts list)', async ({ browser }) => {
    await withPersona(browser, 'marcus', async (page) => {
      const res = await page.goto('/profile/receipts');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
    });
  });

  test('can view /pricing', async ({ browser }) => {
    await withPersona(browser, 'marcus', async (page) => {
      const res = await page.goto('/pricing');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  test('buys a ticket via Stripe Checkout (4242) → on roster + receipt', async ({ browser }) => {
    const skipReason = shouldSkipStripeTests();
    if (skipReason) test.skip(true, skipReason);
    skipIfPersonaMissing('marcus');
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    test.setTimeout(180_000);

    const title = `E2E Marcus Buy ${Date.now()}`;
    await withStripeHostPaidEvent(browser, { title, priceUsd: 5 }, async (eventUrl, appOrigin) => {
      await withPersona(browser, 'marcus', async (page) => {
        await page.goto(eventUrl);
        await page.waitForLoadState('domcontentloaded');

        // Paid panel renders a ConfirmSubmitButton "Pay online — $5.00".
        await clickConfirmedSubmit(page, /pay online/i);
        await fillStripeCheckout(page, { card: STRIPE_TEST_CARDS.success });
        await waitForStripeRedirect(page, appOrigin);

        // Webhook lands → Marcus is on the roster (the paid panel now offers
        // "Cancel sign-up").
        await pollUiFor(page, async () => {
          await page.goto(eventUrl);
          return (await page.getByRole('button', { name: /cancel sign-up/i }).count()) > 0;
        });

        // …and the purchase shows on his receipts (event_payment_audit → UI).
        await pollUiFor(page, async () => {
          await page.goto('/profile/receipts');
          return (await page.getByText(new RegExp(title, 'i')).count()) > 0;
        });
      });
    });
  });

  test('checkout with the decline card (4000…0002) is rejected — not on roster', async ({
    browser,
  }) => {
    const skipReason = shouldSkipStripeTests();
    if (skipReason) test.skip(true, skipReason);
    skipIfPersonaMissing('marcus');
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    test.setTimeout(180_000);

    const title = `E2E Marcus Decline ${Date.now()}`;
    await withStripeHostPaidEvent(browser, { title, priceUsd: 5 }, async (eventUrl) => {
      await withPersona(browser, 'marcus', async (page) => {
        await page.goto(eventUrl);
        await page.waitForLoadState('domcontentloaded');

        await clickConfirmedSubmit(page, /pay online/i);
        await fillStripeCheckout(page, { card: STRIPE_TEST_CARDS.declined });

        // Decline keeps the user on checkout.stripe.com with an inline error.
        await expectStripeDeclineError(page);
        expect(page.url()).toContain('checkout.stripe.com');

        // Back on the event, Marcus must NOT be on the roster (no cancel/refund).
        await page.goto(eventUrl);
        await page.waitForLoadState('domcontentloaded');
        expect(await page.getByRole('button', { name: /cancel sign-up/i }).count()).toBe(0);
      });
    });
  });

  test('leaves a tip (0% platform fee) → tip jar → Checkout → tip=thanks', async ({ browser }) => {
    const skipReason = shouldSkipStripeTests();
    if (skipReason) test.skip(true, skipReason);
    skipIfPersonaMissing('marcus');
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    test.setTimeout(180_000);

    const title = `E2E Marcus Tip ${Date.now()}`;
    await withStripeHostPaidEvent(browser, { title, priceUsd: 5 }, async (eventUrl, appOrigin) => {
      await withPersona(browser, 'marcus', async (page) => {
        await page.goto(eventUrl);
        await page.waitForLoadState('domcontentloaded');

        // The tip jar shows because the host can collect tips (Stripe Connect).
        // Open it; the default amount is $5 → the submit reads "Tip $5.00".
        await page.getByRole('button', { name: /leave a tip/i }).click();
        await page.getByRole('button', { name: /tip \$5\.00/i }).click();

        await fillStripeCheckout(page, { card: STRIPE_TEST_CARDS.success });
        await waitForStripeRedirect(page, appOrigin);

        // The success_url returns to the event with the tip=thanks flash.
        await expect(page.getByText(/thanks for tipping/i)).toBeVisible({ timeout: 15_000 });
      });
    });
  });

  test('cancel inside the refund window auto-refunds → off roster + refunded receipt', async ({
    browser,
  }) => {
    const skipReason = shouldSkipStripeTests();
    if (skipReason) test.skip(true, skipReason);
    skipIfPersonaMissing('marcus');
    skipIfMissingAuth(STORAGE_PATHS.stripeHost, 'stripe-host');
    test.setTimeout(180_000);

    const title = `E2E Marcus Refund ${Date.now()}`;
    // createPaidEvent picks a date ~next month; the stripe-host is free tier so
    // the refund window defaults to 24h. Now is far more than 24h before start →
    // well INSIDE the window, so `leaveEvent` issues an automatic Stripe refund
    // (the `charge.refunded` webhook then removes the roster row).
    await withStripeHostPaidEvent(browser, { title, priceUsd: 5 }, async (eventUrl, appOrigin) => {
      await withPersona(browser, 'marcus', async (page) => {
        // Buy.
        await page.goto(eventUrl);
        await page.waitForLoadState('domcontentloaded');
        await clickConfirmedSubmit(page, /pay online/i);
        await fillStripeCheckout(page, { card: STRIPE_TEST_CARDS.success });
        await waitForStripeRedirect(page, appOrigin);
        await pollUiFor(page, async () => {
          await page.goto(eventUrl);
          return (await page.getByRole('button', { name: /cancel sign-up & refund/i }).count()) > 0;
        });

        // Cancel & refund (inside the window → auto Stripe refund).
        await clickConfirmedSubmit(page, /cancel sign-up & refund/i);

        // The refund webhook deletes the roster row → the paid panel reverts to
        // the "Pay online" buy CTA (Marcus is no longer attending).
        await pollUiFor(page, async () => {
          await page.goto(eventUrl);
          return (await page.getByRole('button', { name: /pay online/i }).count()) > 0;
        });

        // The receipt now carries the refund adjustment.
        await pollUiFor(page, async () => {
          await page.goto('/profile/receipts');
          const card = page
            .locator('li, tr, section')
            .filter({ hasText: new RegExp(title, 'i') })
            .first();
          if ((await card.count()) === 0) return false;
          return /refund/i.test((await card.textContent()) ?? '');
        });
      });
    });
  });

  // Still fixme — the OUTSIDE-window case (cancelling within `refundWindowHours`
  // of start leaves you on the roster, no auto-refund → host-manual) needs a
  // near-future paid event, i.e. a `pickNearFutureDateTime` timing helper the
  // UI date picker doesn't make easy. Pairs with refund-window-gating.authed.spec.ts.
  test.fixme('cancelling outside the refund window does not auto-refund (host-manual)', async () => {});
});
