import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';

/**
 * Rachel Kim (P17) — the lapsed Pro host (subscription-lifecycle boundaries).
 * docs/personas.md.
 *
 * Rachel went Pro for a summer then let it lapse: trial → active → past_due
 * grace → cancelled/Free. The interesting behaviour is the perk gating at each
 * boundary (the `is_pro_host` RPC treats active + trialing as Pro and
 * grace-periods past_due) — which needs Stripe `customer.subscription.*`
 * webhook delivery to drive the states, so those are fixme. The Pro billing
 * page and the standalone-bracket entry point are runnable now.
 */

const rachel = PERSONAS.rachel;

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
      // requireRealUser gates this route. A real account either lands on the
      // create page or (if the free "1 active standalone bracket" cap is hit)
      // is shown an at-cap notice — both are valid, neither is /login.
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

  // Subscription state transitions + perk gating need Stripe webhook delivery
  // (features.md § 5). Documented intent:
  test.fixme('Pro perks (templates/CSV/analytics/badge) disappear after the subscription lapses', async () => {});
  test.fixme('standalone-bracket cap drops to 1 active after downgrade to Free', async () => {});
  test.fixme('rolling-30d paid-event cap re-applies after downgrade', async () => {});
  test.fixme('cancelling a paid event does NOT free a free-tier slot (abuse guard)', async () => {});
});
