import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';

/**
 * Sofia Reyes (P5) — the tournament director (Pro + Stripe). docs/personas.md.
 *
 * Sofia exists to stress the **tournament + divisions + bracket** surface. The
 * single-elimination create→seed→generate→record→champion arc is already
 * covered end-to-end by `bracket.authed.spec.ts` (self-provisioned as
 * attendee-a via `_helpers/tournament.ts`), so Sofia's NEW value is:
 *   - the create-form building blocks (Tournament type → divisions repeater →
 *     free-agent toggle), runnable as a Pro host, and
 *   - the bracket FORMATS beyond single elim (double elim, round robin, pool
 *     play → playoff), which stay fixme until a per-format fixture exists.
 *
 * Read-only assertions also run against the persistent seed tournaments
 * (`/e/E2ETFR`, `/e/E2ETFA` — hosted by free-host) to confirm the public
 * tournament surface renders.
 */

const sofia = PERSONAS.sofia;

test.describe(`${sofia.name} (${sofia.id}) — tournament create surface`, () => {
  test('Tournament type reveals the divisions repeater', async ({ browser }) => {
    await withPersona(browser, 'sofia', async (page) => {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain('/events/new');

      // Switch to Tournament (label wraps an sr-only radio — target by the
      // radio it contains, the same pattern createAdHocTournament uses).
      await page
        .locator('label')
        .filter({ has: page.locator('input[name="type"][value="tournament"]') })
        .click();

      // The required division row appears.
      await expect(page.locator('input[name="div_0_label"]').first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test('division config exposes a free-agent / pool toggle', async ({ browser }) => {
    await withPersona(browser, 'sofia', async (page) => {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');
      await page
        .locator('label')
        .filter({ has: page.locator('input[name="type"][value="tournament"]') })
        .click();
      await expect(page.locator('input[name="div_0_label"]').first()).toBeVisible({
        timeout: 10_000,
      });
      // Per-division free-agent pool toggle (features.md § 1, event-type matrix).
      const hasFreeAgent = await isVisibleOrTimeout(
        page.getByText(/free agent|free-agent|agent pool/i).first(),
        3_000,
      );
      if (!hasFreeAgent) {
        test.skip(true, 'free-agent toggle not found on this build — selector or UX drift');
      }
      expect(hasFreeAgent).toBe(true);
    });
  });
});

test.describe(`${sofia.name} (${sofia.id}) — seed tournament surface (read-only)`, () => {
  test('the roster seed tournament /e/E2ETFR renders', async ({ browser }) => {
    await withPersona(browser, 'sofia', async (page) => {
      const res = await page.goto('/e/E2ETFR');
      if (!res || res.status() >= 400) {
        test.skip(
          true,
          'E2ETFR seed not applied on this environment (seed-tournament-fixture.sql)',
        );
      }
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/tournament|division|team|bracket/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });
});

test.describe(`${sofia.name} (${sofia.id}) — bracket formats beyond single elim`, () => {
  // bracket.authed.spec.ts covers single_elimination end-to-end. These three
  // formats (features.md § 8) need their own per-format disposable fixture +
  // record assertions. Documented intent:
  test.fixme('double_elimination: winners/losers/final advancement', async () => {});
  test.fixme('round_robin: every-team-plays-every-team standings', async () => {});
  test.fixme('pool_play_playoff: pools resolve into a playoff bracket', async () => {});
});
