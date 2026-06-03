import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { createFreeOpenPlayEvent, cancelEvent, pickFutureDateTime } from './_helpers/event-create';
import { deleteEventById } from './_helpers/cleanup';

/**
 * Nina Okafor (P7) — the new host who has NOT connected Stripe yet (account
 * exists, charges not enabled). docs/personas.md.
 *
 * Nina is the unhappy-path mirror of Carlos (P6, Stripe-ready). The headline:
 * a host without `charges_enabled` can publish a FREE event, but a PAID event
 * is stopped by the payment-readiness preflight and pointed at finishing Stripe
 * setup (journal 2026-06-03-bundle-event-payment-readiness-preflight, AGENTS.md
 * § Pattern 15 — the CTA is shown to the host, who CAN act on it).
 */

const nina = PERSONAS.nina;

test.describe(`${nina.name} (${nina.id}) — host without Stripe`, () => {
  test('/profile/billing shows the "Connect with Stripe" onboarding CTA', async ({ browser }) => {
    await withPersona(browser, 'nina', async (page) => {
      const res = await page.goto('/profile/billing');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      // Not yet connected → onboarding CTA, not "View earnings"/"Stripe dashboard".
      const hasConnectCta = await isVisibleOrTimeout(
        page
          .getByRole('button', { name: /connect with stripe|connect stripe|set up stripe/i })
          .or(page.getByRole('link', { name: /connect with stripe|finish.*stripe|set up stripe/i }))
          .first(),
        10_000,
      );
      const mentionsConnect = await isVisibleOrTimeout(
        page.getByText(/connect|charges|finish.*setup/i).first(),
        5_000,
      );
      expect(hasConnectCta || mentionsConnect).toBe(true);
    });
  });

  test('can publish a FREE event without Stripe', async ({ browser }) => {
    test.slow();
    await withPersona(browser, 'nina', async (page) => {
      let created: { url: string; id: string } | null = null;
      try {
        created = await createFreeOpenPlayEvent(page, {
          title: `E2E Persona Nina Free ${Date.now()}`,
        });
        expect(created.url).toMatch(/\/events\/[0-9a-f-]{36}/);
      } finally {
        if (created) {
          await cancelEvent(page, created.url);
          await deleteEventById(created.id);
        }
      }
    });
  });

  test('a PAID event is blocked by the readiness preflight (no event published)', async ({
    browser,
  }) => {
    test.slow();
    await withPersona(browser, 'nina', async (page) => {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');
      if (page.url().includes('/login') || page.url().includes('/upgrade')) {
        test.skip(true, 'event creation gated for this account on this environment');
      }

      // Minimal valid open-play form + a non-zero price (same recipe as
      // createPaidEvent, inlined so we can assert the *blocked* outcome).
      await page.locator('#title').fill(`E2E Persona Nina Paid ${Date.now()}`);
      await pickFutureDateTime(page, 'startsAt', '18:00');
      await pickFutureDateTime(page, 'endsAt', '20:00');
      await page.locator('#addressLine').fill('1000 19th St');
      const editDetailsBtn = page.getByRole('button', { name: /edit address details/i });
      if (await isVisibleOrTimeout(editDetailsBtn, 1_000)) await editDetailsBtn.click();
      await page.locator('#city').fill('Virginia Beach');
      await page.locator('#region').fill('VA');
      await page.locator('#postalCode').fill('23451');
      await page.locator('#country').fill('US');

      const priceInput = page.locator('input[name="priceUsd"]').first();
      if (!(await isVisibleOrTimeout(priceInput, 5_000))) {
        // The price field itself may be gated behind Stripe for a non-ready
        // host — that's still the preflight doing its job pre-submit.
        const gatedNotice = await isVisibleOrTimeout(
          page
            .getByText(/connect.*stripe|finish.*stripe|stripe.*to charge|enable charges/i)
            .first(),
          3_000,
        );
        expect(gatedNotice, 'expected a Stripe-setup notice where the price field would be').toBe(
          true,
        );
        return;
      }
      await priceInput.fill('10');
      await page.getByRole('button', { name: /create event/i }).click();

      // The preflight must keep her on the form (no event redirect).
      const published = await page
        .waitForURL(/\/events\/[0-9a-f-]{36}(\?|$)/, { timeout: 8_000 })
        .then(() => true)
        .catch(() => false);

      if (published) {
        // A non-Stripe host published a paid event → real bug. Clean up, fail.
        const id = /\/events\/([0-9a-f-]{36})/.exec(page.url())?.[1];
        const url = page.url().replace(/\?.*$/, '');
        await cancelEvent(page, url);
        if (id) await deleteEventById(id);
      }
      expect(published, 'a host without charges_enabled must not publish a paid event').toBe(false);

      // …and the error points her at finishing Stripe setup.
      const hasGateMessage = await isVisibleOrTimeout(
        page
          .getByText(/stripe|connect|finish.*setup|enable charges|payout/i)
          .or(page.getByRole('link', { name: /billing|stripe|finish.*setup/i }))
          .first(),
        8_000,
      );
      expect(hasGateMessage, 'expected an actionable Stripe-setup gate message').toBe(true);
    });
  });

  // Once she completes Connect onboarding (charges_enabled), the same paid
  // event publishes — needs the Stripe Connect fixture (e2e README § Stripe).
  test.fixme('after completing Stripe onboarding, the paid event publishes', async () => {});
});
