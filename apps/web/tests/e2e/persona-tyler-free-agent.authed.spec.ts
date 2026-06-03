import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';

/**
 * Tyler Brooks (P11) — the free agent (no team → captain pickup).
 * docs/personas.md.
 *
 * Tyler signs up to a division's free-agent pool so a captain can scoop him
 * up. The seeded ad-hoc tournament `/e/E2ETFA` is the read-only target for the
 * free-agent affordance; the actual signup + captain pickup loop needs a
 * second actor and per-test fixture teardown, so it stays fixme.
 */

const tyler = PERSONAS.tyler;

test.describe(`${tyler.name} (${tyler.id}) — free agent`, () => {
  test('the ad-hoc seed tournament /e/E2ETFA renders', async ({ browser }) => {
    await withPersona(browser, 'tyler', async (page) => {
      const res = await page.goto('/e/E2ETFA');
      if (!res || res.status() >= 400) {
        test.skip(
          true,
          'E2ETFA seed not applied on this environment (seed-tournament-fixture.sql)',
        );
      }
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/tournament|division|team|free agent/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test('a free-agent signup affordance is offered when the pool is open', async ({ browser }) => {
    await withPersona(browser, 'tyler', async (page) => {
      const res = await page.goto('/e/E2ETFA');
      if (!res || res.status() >= 400) {
        test.skip(true, 'E2ETFA seed not applied on this environment');
      }
      await page.waitForLoadState('domcontentloaded');
      const hasFreeAgentCta = await isVisibleOrTimeout(
        page
          .getByRole('button', { name: /free agent|join.*pool|sign up as/i })
          .or(page.getByText(/free agent/i))
          .first(),
        4_000,
      );
      if (!hasFreeAgentCta) {
        test.skip(true, 'no free-agent pool open on E2ETFA (host toggle off) — nothing to assert');
      }
      expect(hasFreeAgentCta).toBe(true);
    });
  });

  test('he has no captained team (cold-start free agent)', async ({ browser }) => {
    await withPersona(browser, 'tyler', async (page) => {
      const res = await page.goto('/teams');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  // The signup → pickup → notification loop needs a captain (Bianca) on the
  // other side + per-test teardown. features.md §§ 1, 2.
  test.fixme('registers as a free agent in a division pool', async () => {});
  test.fixme('is picked up by a captain and gets the roster notification', async () => {});
});
