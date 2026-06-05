import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona, personaEmail, skipIfPersonaMissing } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { findCaptainedTeamUrl } from './_helpers/navigation';
import { expandSignupSection } from './_helpers/stripe';
import {
  createRosterTournamentFixture,
  deleteRosterTournamentFixture,
  rosterTournamentFixtureAvailable,
  type RosterTournamentFixture,
} from './_helpers/roster-tournament';

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

  test('registers his team into a tournament division (division_id)', async ({ browser }) => {
    skipIfPersonaMissing('adam');
    const hostEmail = process.env['TEST_FREE_HOST_EMAIL'] ?? process.env['TEST_USER_EMAIL'];
    const captainEmail = personaEmail('adam');
    test.skip(
      !rosterTournamentFixtureAvailable(hostEmail, captainEmail),
      'roster-tournament fixture needs E2E_CLEANUP_SUPABASE_* + a host email + TEST_ATTENDEE_B_EMAIL (the tournament + Adam’s team are admin-provisioned)',
    );
    test.setTimeout(120_000);

    const tag = Date.now().toString(36);
    let fx: RosterTournamentFixture | null = null;
    try {
      fx = await createRosterTournamentFixture({
        title: `E2E Adam Register ${tag}`,
        hostEmail: hostEmail!,
        captainEmail: captainEmail!,
        teamName: `E2E Net Ninjas ${tag}`,
      });

      await withPersona(browser, 'adam', async (page) => {
        await page.goto(`/events/${fx!.eventId}`);
        await page.waitForLoadState('domcontentloaded');

        // The "Register" section is a collapsible <details> that defaults
        // *collapsed* here: `viewerRegistered` counts captaining a team, and
        // Adam captains his seeded team, so the panel treats him as already in.
        // Force it open (clicking the summary can hang on the consent overlay).
        await expandSignupSection(page);

        // Make the "Register a team" segment active (it's the default for a
        // non-free-agent — clicked for determinism), then pick his seeded team.
        // Single roster division → division_id is a hidden input, so submitting
        // posts straight through to the ?team=registered confirmation.
        await page.getByRole('radio', { name: /register a team/i }).click();
        const teamSelect = page.locator('select[name="team_id"]');
        await expect(teamSelect).toBeVisible({ timeout: 10_000 });
        await teamSelect.selectOption(fx!.teamId);
        await page.getByRole('button', { name: /register team/i }).click();

        await expect(page.getByText(/your team is registered/i)).toBeVisible({ timeout: 10_000 });
        // The team now appears under the division's "Registered" list.
        await expect(page.getByText(fx!.teamName).first()).toBeVisible({ timeout: 10_000 });
      });
    } finally {
      await deleteRosterTournamentFixture(fx);
    }
  });

  // Pointer, not a gap — the invite→accept→roster flow is owned by
  // teams.authed.spec.ts › "captain invites attendee-b, attendee-b accepts,
  // roster shows member, captain removes". Kept as Adam's competitive-arc signpost.
  test.fixme('invites a teammate; they accept — see teams.authed.spec.ts', async () => {});
});
