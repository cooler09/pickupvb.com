import { test, expect } from './_helpers/fixtures';
import type { Page } from '@playwright/test';
import { PERSONAS, withPersona, personaEmail, skipIfPersonaMissing } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { createPaidEvent, openTemplatesModal } from './_helpers/event-create';
import { deleteEventById } from './_helpers/cleanup';
import {
  hostSubscriptionControlAvailable,
  setHostSubscriptionStatus,
  restoreHostSubscription,
  armStandaloneBracket,
  deleteArmedBracket,
  armPaidEvent,
  deleteArmedPaidEvent,
  type SavedSubscription,
} from './_helpers/host-subscription';

/**
 * Rachel Kim (P17) — the lapsed Pro host (subscription-lifecycle boundaries).
 * docs/personas.md.
 *
 * Rachel went Pro for a summer then let it lapse. The interesting behaviour is
 * the perk gating + free-tier caps at each boundary. Rather than drive Stripe
 * `customer.subscription.*` webhooks (slow, flaky), the lifecycle tests flip
 * `host_subscriptions.status` directly through the admin client
 * (`_helpers/host-subscription.ts`, mirroring `set-host-subscription.mjs`),
 * assert the gating, then RESTORE Rachel's original row so the shared dev account
 * isn't left lapsed. All four are infra-gated on `E2E_CLEANUP_SUPABASE_*` +
 * `TEST_LAPSED_PRO_EMAIL`.
 */

const rachel = PERSONAS.rachel;
const NEEDS =
  'needs E2E_CLEANUP_SUPABASE_* + TEST_LAPSED_PRO_EMAIL (subscription state is admin-controlled)';

/**
 * Attempt to create a paid event as the current persona, expecting the free-tier
 * rolling-30d cap to block it. Asserts the block + the cap message, and cleans
 * up if the cap unexpectedly let the event through (so a regression doesn't leak
 * a paid event).
 */
async function expectPaidEventCapBlock(page: Page): Promise<void> {
  let created: { url: string; id: string } | null = null;
  let errMsg = '';
  try {
    created = await createPaidEvent(page, { title: `E2E Rachel Cap ${Date.now()}`, priceUsd: 5 });
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
  }
  if (created) await deleteEventById(created.id); // cap didn't fire — don't leak
  expect(created, 'a 2nd paid event must be blocked by the rolling-30d cap').toBeNull();
  expect(errMsg, 'the block must be the paid-event cap').toMatch(
    /paid event per 30 days|upgrade to pro/i,
  );
}

test.describe(`${rachel.name} (${rachel.id}) — Pro lifecycle`, () => {
  test('/profile/billing/pro loads with a subscribe/manage CTA', async ({ browser }) => {
    await withPersona(browser, 'rachel', async (page) => {
      const res = await page.goto('/profile/billing/pro');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      const hasCta = await isVisibleOrTimeout(
        page
          .getByRole('button', { name: /subscribe|get pro|upgrade|manage/i })
          .or(page.getByText(/pro|plan|month|year|trial/i))
          .first(),
        10_000,
      );
      expect(hasCta).toBe(true);
    });
  });

  test('/brackets/new is reachable for a real (non-anonymous) user', async ({ browser }) => {
    await withPersona(browser, 'rachel', async (page) => {
      await page.goto('/brackets/new');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).not.toContain('/login');
      const onCreate = await isVisibleOrTimeout(
        page
          .getByRole('button', { name: /create bracket/i })
          .or(page.getByText(/bracket name|add team|at your limit|upgrade/i))
          .first(),
        10_000,
      );
      expect(onCreate).toBe(true);
    });
  });

  test('Pro perks (Templates) disappear after the subscription lapses', async ({ browser }) => {
    const email = personaEmail('rachel');
    test.skip(!hostSubscriptionControlAvailable(email), NEEDS);
    skipIfPersonaMissing('rachel');
    test.setTimeout(120_000);

    let saved: SavedSubscription | null = null;
    try {
      // Pro: the Templates affordance shows on /events/new (Pro-gated section).
      saved = await setHostSubscriptionStatus(email!, 'active');
      await withPersona(browser, 'rachel', async (page) => {
        await page.goto('/events/new');
        await page.waitForLoadState('domcontentloaded');
        expect(await openTemplatesModal(page), 'Pro host sees the Templates affordance').toBe(true);
      });

      // Lapse → Free: the Templates affordance is gone (subtle upsell instead).
      await setHostSubscriptionStatus(email!, 'canceled');
      await withPersona(browser, 'rachel', async (page) => {
        await page.goto('/events/new');
        await page.waitForLoadState('domcontentloaded');
        expect(await openTemplatesModal(page), 'lapsed host loses the Templates affordance').toBe(
          false,
        );
      });
    } finally {
      await restoreHostSubscription(saved);
    }
  });

  test('standalone-bracket cap applies (1 active) after downgrade to Free', async ({ browser }) => {
    const email = personaEmail('rachel');
    test.skip(!hostSubscriptionControlAvailable(email), NEEDS);
    skipIfPersonaMissing('rachel');
    test.setTimeout(120_000);

    let saved: SavedSubscription | null = null;
    let bracketId: string | null = null;
    try {
      // Free tier + one active standalone bracket → at the cap.
      saved = await setHostSubscriptionStatus(email!, 'canceled');
      bracketId = await armStandaloneBracket(email!);

      await withPersona(browser, 'rachel', async (page) => {
        await page.goto('/brackets/new');
        await page.waitForLoadState('domcontentloaded');
        // /brackets/new renders the upgrade path (cap.reason + "Upgrade to Pro")
        // instead of the create form when the host is at the cap.
        await expect(page.getByText(/standalone bracket|upgrade to pro/i).first()).toBeVisible({
          timeout: 10_000,
        });
        await expect(page.getByRole('button', { name: /create bracket/i })).toHaveCount(0);
      });
    } finally {
      await deleteArmedBracket(bracketId);
      await restoreHostSubscription(saved);
    }
  });

  test('rolling-30d paid-event cap re-applies after downgrade to Free', async ({ browser }) => {
    const email = personaEmail('rachel');
    test.skip(!hostSubscriptionControlAvailable(email), NEEDS);
    skipIfPersonaMissing('rachel');
    test.setTimeout(150_000);

    let saved: SavedSubscription | null = null;
    let armEventId: string | null = null;
    try {
      saved = await setHostSubscriptionStatus(email!, 'canceled'); // Free
      armEventId = await armPaidEvent(email!); // one paid event in the rolling 30d
      await withPersona(browser, 'rachel', async (page) => {
        await expectPaidEventCapBlock(page);
      });
    } finally {
      await deleteArmedPaidEvent(armEventId);
      await restoreHostSubscription(saved);
    }
  });

  test('cancelling a paid event does NOT free a free-tier slot (abuse guard)', async ({
    browser,
  }) => {
    const email = personaEmail('rachel');
    test.skip(!hostSubscriptionControlAvailable(email), NEEDS);
    skipIfPersonaMissing('rachel');
    test.setTimeout(150_000);

    let saved: SavedSubscription | null = null;
    let armEventId: string | null = null;
    try {
      saved = await setHostSubscriptionStatus(email!, 'canceled'); // Free
      // The arming paid event is CANCELLED — the cap count is status-agnostic
      // (`host_paid_event_count_30d` filters only on a paid division + 30d
      // window), so a cancelled paid event must still occupy the slot.
      armEventId = await armPaidEvent(email!, { status: 'cancelled' });
      await withPersona(browser, 'rachel', async (page) => {
        await expectPaidEventCapBlock(page);
      });
    } finally {
      await deleteArmedPaidEvent(armEventId);
      await restoreHostSubscription(saved);
    }
  });
});
