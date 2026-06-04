import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona, personaEmail, skipIfPersonaMissing } from './_helpers/personas';
import {
  createLeagueFixture,
  deleteLeagueFixture,
  leagueFixtureAvailable,
  type LeagueFixture,
} from './_helpers/league';

/**
 * Diana Wells (P4) — the league organizer (Pro + Stripe, owns Coastal
 * Volleyball League). docs/personas.md.
 *
 * The league create flow has since SHIPPED — `/events/new` now offers a League
 * type (`new-event-form.tsx` EventType.League; `actions.ts` creates
 * `type: 'league'` with per-division pricing). But the weekly-season machinery
 * (schedule, results, forfeits) has **no UI provisioning path for the season
 * itself** beyond the manual add-match form, so the mutating flows below still
 * self-provision a disposable league (event + roster division + N rostered
 * teams) through the service-role admin client (`_helpers/league.ts`), now
 * hosted by Diana rather than attendee-a, and drive the schedule / forfeit
 * surfaces through the real UI as Diana via `withPersona`.
 *
 * These are the same proven flows as `league.authed.spec.ts` (which drives them
 * as the per-worker attendee-a), re-homed onto the persona that owns them in
 * docs/personas.md. Because the league fixture needs service-role access, the
 * mutating tests are a sanctioned infra-gated skip when the admin client isn't
 * configured (`E2E_CLEANUP_SUPABASE_*`) — counted against the skip budget, not
 * a silent `test.fixme`.
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

  test('host adds a Week-1 match and records a final score', async ({ browser }) => {
    skipIfPersonaMissing('diana');
    const hostEmail = personaEmail('diana');
    test.skip(
      !leagueFixtureAvailable(hostEmail),
      'league fixture needs E2E_CLEANUP_SUPABASE_* + TEST_LEAGUE_HOST_EMAIL (leagues self-provision via the admin client)',
    );
    test.setTimeout(120_000);

    const tag = Date.now().toString(36);
    const teams = [`E2E ${tag} Aces`, `E2E ${tag} Blocks`];
    let fx: LeagueFixture | null = null;

    try {
      fx = await createLeagueFixture({
        title: `E2E Diana League Schedule ${tag}`,
        teamNames: teams,
        // Spread (not pass-undefined) for exactOptionalPropertyTypes; the skip
        // above guarantees hostEmail is set by the time we get here.
        ...(hostEmail ? { hostEmail } : {}),
      });

      await withPersona(browser, 'diana', async (page) => {
        await page.goto(`/events/${fx!.eventId}/schedule`);

        // Diana (host) sees the schedule with both rostered teams and the add
        // form. Mirrors league.authed.spec.ts; the only difference is the actor.
        await expect(page.getByRole('heading', { name: /add a match/i })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByText(/2 registered teams/i)).toBeVisible();

        // Add a Week-1 match. The fixture window is wide + live so a "+2 days"
        // datetime-local lands inside the event window the LeagueSchedule.addMatch
        // invariant enforces.
        const when = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
        await page.locator('input[name="week"]').fill('1');
        await page.locator('input[name="scheduledAt"]').fill(when);
        await page.locator('select[name="homeEntryId"]').selectOption(fx!.teams[0]!.entryId);
        await page.locator('select[name="awayEntryId"]').selectOption(fx!.teams[1]!.entryId);
        await page.getByRole('button', { name: /^add match$/i }).click();
        await page.waitForURL(/notice=added/, { timeout: 15_000 });

        // The match row renders both teams and a "Scheduled" status (scope the
        // `<li>` by the home-team name — the add-form `<option>`s aren't `<li>`s
        // so they can't collide).
        const matchRow = page.locator('li').filter({ hasText: teams[0]! }).first();
        await expect(matchRow).toContainText(teams[1]!);
        await expect(matchRow).toContainText(/Scheduled/);

        // Record 25–15 via the per-row "Edit / record result" disclosure. This
        // drives recordResultFromForm → record_league_match_result (the
        // user-scoped, RLS-gated single-row UPDATE). Diana passes
        // is_event_host_for_division, so the write lands.
        const editDetails = page
          .locator('details', {
            has: page.locator('summary', { hasText: /edit \/ record result/i }),
          })
          .first();
        await editDetails.locator('summary').click();
        await editDetails.locator('input[name="homeScore"]').fill('25');
        await editDetails.locator('input[name="awayScore"]').fill('15');
        await editDetails.locator('select[name="status"]').selectOption('completed');
        await editDetails.getByRole('button', { name: /record result/i }).click();
        await page.waitForURL(/notice=recorded/, { timeout: 15_000 });

        // The recorded score + "Final" status now show on the row.
        const recordedRow = page.locator('li').filter({ hasText: teams[0]! }).first();
        await expect(recordedRow).toContainText('25');
        await expect(recordedRow).toContainText('15');
        await expect(recordedRow).toContainText(/Final/);
      });
    } finally {
      await deleteLeagueFixture(fx);
    }
  });

  test('host marks a team forfeited, then reinstates it', async ({ browser }) => {
    skipIfPersonaMissing('diana');
    const hostEmail = personaEmail('diana');
    test.skip(
      !leagueFixtureAvailable(hostEmail),
      'league fixture needs E2E_CLEANUP_SUPABASE_* + TEST_LEAGUE_HOST_EMAIL (leagues self-provision via the admin client)',
    );
    test.setTimeout(120_000);

    const tag = Date.now().toString(36);
    const teams = [`E2E ${tag} Spikers`, `E2E ${tag} Diggers`];
    let fx: LeagueFixture | null = null;

    try {
      fx = await createLeagueFixture({
        title: `E2E Diana League Forfeit ${tag}`,
        teamNames: teams,
        ...(hostEmail ? { hostEmail } : {}),
      });

      await withPersona(browser, 'diana', async (page) => {
        // The "League teams" forfeit panel lives in the host manage dashboard
        // (/events/[id]/manage → "Wrap up"). The forfeit / reinstate actions
        // revalidate that path in place (no redirect), so the panel re-renders
        // with the updated buttons and the auto-waiting count assertions hold.
        const leagueTeamsHeading = page.getByRole('heading', { name: /league teams/i });
        const markForfeited = page.getByRole('button', { name: /mark forfeited/i });
        const reinstate = page.getByRole('button', { name: /^reinstate$/i });

        await page.goto(`/events/${fx!.eventId}/manage`);
        await expect(leagueTeamsHeading).toBeVisible({ timeout: 15_000 });

        // Both teams start active → two "Mark forfeited" buttons, no "Reinstate".
        await expect(markForfeited).toHaveCount(2);
        await expect(reinstate).toHaveCount(0);

        // Forfeit one team — the action revalidates the manage path in place.
        await markForfeited.first().click();
        await expect(reinstate).toHaveCount(1, { timeout: 15_000 });
        await expect(markForfeited).toHaveCount(1);

        // Reinstate it → back to two active teams.
        await reinstate.first().click();
        await expect(markForfeited).toHaveCount(2, { timeout: 15_000 });
        await expect(reinstate).toHaveCount(0);
      });
    } finally {
      await deleteLeagueFixture(fx);
    }
  });

  // Still fixme — these two need surfaces the league fixture + schedule/manage
  // pages don't expose yet:
  //  - host-add of an account-less rostered team + "mark paid off-platform"
  //    lives in the host-managed team-registration flow (ADR 0033/0034,
  //    host-team-registration-actions.ts), whose migration may not be on every
  //    target env; provisioning it here would need that surface wired for a
  //    league division.
  //  - season-end playoff generation from final standings has no
  //    standings→bracket UI on the schedule page today.
  test.fixme('host-adds an account-less rostered team and marks it paid off-platform', async () => {});
  test.fixme('season-end playoff bracket generates from final standings', async () => {});
});
