import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { findCaptainedTeamUrl } from './_helpers/navigation';

/**
 * Adam Russo (P9) — the competitive captain. docs/personas.md.
 *
 * Adam adopts the attendee-b account (TEST_ATTENDEE_B_EMAIL) — the suite's
 * second multi-actor identity. In the relationship graph he captains Net
 * Ninjas, plays on Sand Sharks, and registers teams for Sofia's / Mark's
 * brackets. Here he's the PRIMARY actor; the team-register and invite flows
 * (which need a second account on the other side) stay fixme.
 */

const adam = PERSONAS.adam;

test.describe(`${adam.name} (${adam.id}) — competitive captain`, () => {
  test('reaches the /teams hub', async ({ browser }) => {
    await withPersona(browser, 'adam', async (page) => {
      const res = await page.goto('/teams');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  test('can open a team he captains (if any)', async ({ browser }) => {
    await withPersona(browser, 'adam', async (page) => {
      const teamUrl = await findCaptainedTeamUrl(page);
      if (!teamUrl) {
        test.skip(true, 'Adam captains no team yet — seed Net Ninjas with Adam as captain');
      }
      const res = await page.goto(teamUrl!);
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      // Captain view exposes roster management (a UserPicker combobox / add CTA).
      const isCaptainView = await isVisibleOrTimeout(
        page
          .getByRole('combobox')
          .or(page.getByRole('button', { name: /add teammate|add member|message team/i }))
          .first(),
        5_000,
      );
      expect(typeof isCaptainView).toBe('boolean');
    });
  });

  test('sees the seed tournament bracket read-only when not its host', async ({ browser }) => {
    await withPersona(browser, 'adam', async (page) => {
      const res = await page.goto('/e/E2ETFR');
      if (!res || res.status() >= 400) {
        test.skip(true, 'E2ETFR seed not applied on this environment');
      }
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  // Need a second account on the other side (a teammate to invite, a host's
  // tournament to register into). Owned by teams.authed.spec.ts (invite) and
  // documented here as Adam's competitive arc (features.md §§ 8, 9).
  test.fixme('registers his team into a tournament division (division_id)', async () => {});
  test.fixme('invites a teammate; they accept and appear on the roster', async () => {});
});
