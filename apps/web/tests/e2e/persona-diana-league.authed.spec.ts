import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';

/**
 * Diana Wells (P4) — the league organizer (Pro + Stripe, owns Coastal
 * Volleyball League). docs/personas.md.
 *
 * The league create flow has since SHIPPED — `/events/new` now offers a League
 * type (`new-event-form.tsx` EventType.League; `actions.ts` creates
 * `type: 'league'` with per-division pricing). This e2e caught that the old
 * "leagues have no UI create path" assumption (docs/journal/memory +
 * `_helpers/league.ts`'s admin-fixture workaround) is now stale. The weekly-
 * season machinery (add match, forfeit, playoff) is still fixme here — it can
 * now be graduated to drive the real create flow instead of the admin fixture.
 */

const diana = PERSONAS.diana;

test.describe(`${diana.name} (${diana.id}) — league organizer`, () => {
  test('the /events/new type chooser offers Open Play, Tournament, and League', async ({
    browser,
  }) => {
    await withPersona(browser, 'diana', async (page) => {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain('/events/new');
      // All three first-class event types are now selectable (league create
      // flow shipped — see the file header).
      for (const t of ['open_play', 'tournament', 'league']) {
        expect(
          await page.locator(`input[name="type"][value="${t}"]`).count(),
          `event type "${t}" should be offered on /events/new`,
        ).toBeGreaterThan(0);
      }
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
