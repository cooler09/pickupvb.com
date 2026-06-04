import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { createFreeOpenPlayEvent, cancelEvent } from './_helpers/event-create';
import { deleteEventById } from './_helpers/cleanup';

/**
 * Julie Tran (P2) — the free host who runs events as herself (no group, no
 * Pro). docs/personas.md.
 *
 * Adopts the `free-host` account (TEST_FREE_HOST_EMAIL). Julie is the negative
 * mirror of Mark (P1): the Pro-only affordances must be ABSENT for her, and
 * the free-tier paid-event cap must bite on her second paid event in 30 days.
 * The free open-play create is fully runnable for her (no Stripe needed).
 */

const julie = PERSONAS.julie;

test.describe(`${julie.name} (${julie.id}) — free host surfaces`, () => {
  test('reaches /events/new but sees NO Pro template card', async ({ browser }) => {
    await withPersona(browser, 'julie', async (page) => {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain('/events/new');
      // Free tier: the Pro-gated "Templates" affordance must be absent. The
      // trigger button is the real Pro signal — the template-name input only
      // mounts inside the modal once opened, so its absence alone wouldn't
      // distinguish free from Pro.
      await expect(page.getByRole('button', { name: /^templates$/i })).toHaveCount(0);
      expect(await page.getByPlaceholder(/template name/i).count()).toBe(0);
    });
  });

  test('/profile/billing/analytics shows the upgrade prompt (free tier)', async ({ browser }) => {
    await withPersona(browser, 'julie', async (page) => {
      const res = await page.goto('/profile/billing/analytics');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      const hasUpgrade = await isVisibleOrTimeout(
        page.getByText(/upgrade|get pro|pro.*unlock|included with pro/i).first(),
        10_000,
      );
      expect(hasUpgrade).toBe(true);
    });
  });

  test('hosts a free open play as herself and can edit it', async ({ browser }) => {
    test.slow();
    await withPersona(browser, 'julie', async (page) => {
      let created: { url: string; id: string } | null = null;
      try {
        created = await createFreeOpenPlayEvent(page, {
          title: `E2E Persona Julie ${Date.now()}`,
        });
        await page.goto(`${created.url}/edit`);
        await expect(page.getByRole('button', { name: /save|update event/i }).first()).toBeVisible({
          timeout: 10_000,
        });
      } finally {
        if (created) {
          await cancelEvent(page, created.url);
          await deleteEventById(created.id);
        }
      }
    });
  });

  // The cap is a rolling-30d window keyed on a Stripe-onboarded free host with
  // one paid event already in the window; needs the Stripe fixture suite to
  // create the first paid event. Documented intent (features.md § 5):
  test.fixme('second paid event in 30 days is blocked by the free-tier cap with an upgrade CTA', async () => {});
});
