import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona, personaEmail, skipIfPersonaMissing } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import {
  createFreeOpenPlayEvent,
  cancelEvent,
  attemptPaidEventExpectCapBlock,
} from './_helpers/event-create';
import { deleteEventById } from './_helpers/cleanup';
import {
  armPaidEvent,
  deleteArmedPaidEvent,
  hostSubscriptionControlAvailable,
} from './_helpers/host-subscription';

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

  test('second paid event in 30 days is blocked by the free-tier cap with an upgrade CTA', async ({
    browser,
  }) => {
    const email = personaEmail('julie');
    test.skip(
      !hostSubscriptionControlAvailable(email),
      'needs E2E_CLEANUP_SUPABASE_* + TEST_FREE_HOST_EMAIL (the arming paid event is admin-provisioned)',
    );
    skipIfPersonaMissing('julie');
    test.setTimeout(150_000);

    // Julie is natively free — no subscription flip needed. Arm the rolling-30d
    // cap with one admin-provisioned paid event, then a 2nd create is blocked.
    // The cap fires BEFORE the Stripe-charges check (events/new/actions.ts), so
    // no Stripe onboarding is required to exercise it. This is also the second
    // executable regression for the `host_paid_event_count_30d` fix (migration
    // 20260913000000) alongside the Rachel paid-cap specs.
    let armEventId: string | null = null;
    try {
      armEventId = await armPaidEvent(email!);
      await withPersona(browser, 'julie', async (page) => {
        await attemptPaidEventExpectCapBlock(page);
      });
    } finally {
      await deleteArmedPaidEvent(armEventId);
    }
  });
});
