import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';

/**
 * Diana Wells (P4) — the league organizer (Pro + Stripe, owns Coastal
 * Volleyball League). docs/personas.md.
 *
 * Leagues have **no first-class UI create flow** (the `/events/new` type
 * chooser only offers Open Play / Tournament; the detail signup area renders
 * nothing for `type === 'league'`), so the mutating league journeys are
 * provisioned at the data layer by `_helpers/league.ts` and exercised in
 * `league.authed.spec.ts` (currently keyed to attendee-a as host). Diana's
 * runnable value here is the **documentation of that product gap** as an
 * assertion, plus host-home reachability; the weekly-season machinery stays
 * fixme and points at the league helper.
 */

const diana = PERSONAS.diana;

test.describe(`${diana.name} (${diana.id}) — league organizer`, () => {
  test('the /events/new type chooser does NOT offer League (current product state)', async ({
    browser,
  }) => {
    await withPersona(browser, 'diana', async (page) => {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain('/events/new');
      // Open Play + Tournament are offered…
      expect(await page.locator('input[name="type"][value="open_play"]').count()).toBeGreaterThan(
        0,
      );
      expect(await page.locator('input[name="type"][value="tournament"]').count()).toBeGreaterThan(
        0,
      );
      // …but League has no create affordance yet. If this ever flips, the
      // league create flow shipped — graduate the fixmes below.
      expect(await page.locator('input[name="type"][value="league"]').count()).toBe(0);
    });
  });

  test('reaches her host home (/profile)', async ({ browser }) => {
    await withPersona(browser, 'diana', async (page) => {
      const res = await page.goto('/profile');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  // Mutating league season flows — provisioned via _helpers/league.ts
  // (admin-client fixture; sanctioned infra gate). Today these run as
  // attendee-a in league.authed.spec.ts; re-homing them onto Diana needs the
  // league fixture helper to accept a host email. Documented intent
  // (features.md § 1 event-type matrix, ADR 0006 § Addendum):
  test.fixme('host adds a Week-1 match and records a final score', async () => {});
  test.fixme('host marks a team forfeited, then reinstates it', async () => {});
  test.fixme('host-adds an account-less rostered team and marks it paid off-platform', async () => {});
  test.fixme('season-end playoff bracket generates from final standings', async () => {});
});
