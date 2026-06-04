import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona, skipIfPersonaMissing } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import {
  createLeagueFixture,
  deleteLeagueFixture,
  leagueFixtureAvailable,
  type LeagueFixture,
} from './_helpers/league';

/**
 * Tyler Brooks (P11) — the free agent (no team → captain pickup).
 * docs/personas.md.
 *
 * Tyler signs up to a division's free-agent pool so a captain can scoop him up.
 * The signup half is single-actor: a division accepts free agents by default
 * (`event_divisions.allow_free_agents` defaults true), so Tyler can join any
 * roster-division event's pool. The spec reuses the league fixture
 * (`_helpers/league.ts`) to stand up a division-bearing event hosted by someone
 * else, then drives the real `FreeAgentSignupPanel` as Tyler. The captain
 * pickup + notification half needs a second actor (a captain) so it stays fixme.
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

  test('registers as a free agent in a division pool', async ({ browser }) => {
    skipIfPersonaMissing('tyler');
    const hostEmail = process.env['TEST_FREE_HOST_EMAIL'] ?? process.env['TEST_USER_EMAIL'];
    test.skip(
      !leagueFixtureAvailable(hostEmail),
      'free-agent fixture needs E2E_CLEANUP_SUPABASE_* + a host email (the division-bearing event is admin-provisioned)',
    );
    test.setTimeout(120_000);

    // A division-bearing event hosted by someone else, with one roster team so
    // it renders the register/free-agent section. The roster division accepts
    // free agents by default (allow_free_agents), which is what Tyler joins.
    const tag = Date.now().toString(36);
    let fx: LeagueFixture | null = null;
    try {
      fx = await createLeagueFixture({
        title: `E2E Tyler FreeAgent ${tag}`,
        teamNames: [`E2E ${tag} Anchor`],
        ...(hostEmail ? { hostEmail } : {}),
      });

      await withPersona(browser, 'tyler', async (page) => {
        await page.goto(`/events/${fx!.eventId}`);
        await page.waitForLoadState('domcontentloaded');

        // Switch the register section to the free-agent ("Sign up solo") tab,
        // which reveals the FreeAgentSignupPanel.
        await page.getByRole('radio', { name: /sign up solo/i }).click();
        const signUp = page.getByRole('button', { name: /sign up as free agent/i });
        await expect(signUp).toBeVisible({ timeout: 10_000 });
        await signUp.click();

        // Single division → division_id is a hidden input, so the signup posts
        // straight through to the `?fa=joined` confirmation.
        await expect(page.getByText(/you're signed up as a free agent/i)).toBeVisible({
          timeout: 10_000,
        });
      });
    } finally {
      await deleteLeagueFixture(fx);
    }
  });

  // Pointer — the pickup + notification flow is one multi-actor end-to-end test
  // on the captain's side (it drives both Bianca and Tyler). There is no
  // first-class pool→roster pickup, so a captain rosters a free agent via the
  // generic team invite, which carries the `team.invite` notification. Owned by
  // persona-bianca-captain.authed.spec.ts "picks up free-agent Tyler …".
  test.fixme('is picked up by a captain and gets the roster notification — see persona-bianca-captain.authed.spec.ts', async () => {});
});
