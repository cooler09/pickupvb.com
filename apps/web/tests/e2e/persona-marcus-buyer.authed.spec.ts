import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';

/**
 * Marcus Lee (P14) — the paid-ticket buyer / tipper / refunder.
 * docs/personas.md.
 *
 * Marcus is the money-side player: every Stripe buyer path runs through him.
 * Those paths (checkout success + decline, tip jar, refund window) need the
 * Stripe test-mode fixture suite (e2e README § "Stripe Checkout / Connect"),
 * so they're fixme. His receipts surface + the public pricing page are
 * runnable now.
 */

const marcus = PERSONAS.marcus;

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

  // Stripe-driven (test-mode fixture suite required). features.md §§ 4, 6, 14.
  test.fixme('buys a ticket via Stripe Checkout (test card 4242) → attendee + receipt', async () => {});
  test.fixme('checkout with the decline card 4000 0000 0000 0002 is rejected', async () => {});
  test.fixme('leaves a tip (0% platform fee — host receives the full amount)', async () => {});
  test.fixme('leaving inside the refund window auto-refunds; outside it is host-manual', async () => {});
});
