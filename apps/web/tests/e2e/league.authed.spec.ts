import { test, expect } from './_helpers/fixtures';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { withAuthContext } from './_helpers/browser';
import {
  createLeagueFixture,
  deleteLeagueFixture,
  leagueFixtureAvailable,
  type LeagueFixture,
} from './_helpers/league';

/**
 * League flows — the deep, mutating coverage Phase 2 of the e2e coverage
 * audit (C2) calls for. Leagues are the newest, least-covered feature area
 * and the highest-risk one: the match-result write goes through the
 * `record_league_match_result` SECURITY INVOKER RPC, exactly where a silent
 * RLS/authorization regression would hide.
 *
 * Unlike brackets, leagues have **no UI provisioning path at all** — the
 * `/events/new` type chooser only offers Open Play / Tournament, and the
 * event-detail signup area renders nothing for `type === 'league'`. So every
 * test here self-provisions a disposable league (event + roster division + N
 * rostered teams) through the service-role admin client
 * (`_helpers/league.ts`), drives the schedule / forfeit surfaces through the
 * real UI as the host (the default per-worker attendee-a, who is `host_id`
 * and captains every team), and tears the fixture down in `finally`.
 *
 * Because there is no other way to stand a league up, the whole spec is a
 * sanctioned infra-gated skip when the admin client isn't configured
 * (`E2E_CLEANUP_SUPABASE_*`). That is a genuine infra gate, not a silent
 * `test.fixme` — it reports loudly and is counted against the skip budget.
 */

test.describe('league — host builds the schedule and records a result (C2)', () => {
  test('host adds a match, then records the result through the RLS-gated RPC', async ({ page }) => {
    test.skip(
      !leagueFixtureAvailable(),
      'league fixture needs E2E_CLEANUP_SUPABASE_* + TEST_USER_EMAIL (leagues have no UI create path)',
    );
    test.setTimeout(120_000);

    const tag = Date.now().toString(36);
    const teams = [`E2E ${tag} Aces`, `E2E ${tag} Blocks`];
    let fx: LeagueFixture | null = null;

    try {
      fx = await createLeagueFixture({ title: `E2E League Schedule ${tag}`, teamNames: teams });

      await page.goto(`/events/${fx.eventId}/schedule`);

      // Host sees the schedule with both rostered teams and the add form.
      await expect(page.getByRole('heading', { name: /add a match/i })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/2 registered teams/i)).toBeVisible();

      // Add a Week 1 match between the two teams. The window is wide + live so
      // a "+2 days" datetime-local lands inside the event window the
      // LeagueSchedule.addMatch invariant enforces.
      const when = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
      await page.locator('input[name="week"]').fill('1');
      await page.locator('input[name="scheduledAt"]').fill(when);
      await page.locator('select[name="homeEntryId"]').selectOption(fx.teams[0]!.entryId);
      await page.locator('select[name="awayEntryId"]').selectOption(fx.teams[1]!.entryId);
      await page.getByRole('button', { name: /^add match$/i }).click();
      await page.waitForURL(/notice=added/, { timeout: 15_000 });

      // The match row renders both teams and a "Scheduled" status. Scope the
      // `<li>` by the home-team name (the add-form's team `<option>`s aren't
      // `<li>`s, so they can't collide). NB: the matchup spans render with no
      // whitespace between them in `textContent` ("…AcesvsBlocks"), so a
      // `/\bvs\b/` filter never matches — filter on a team name instead.
      const matchRow = page.locator('li').filter({ hasText: teams[0]! }).first();
      await expect(matchRow).toContainText(teams[0]!);
      await expect(matchRow).toContainText(teams[1]!);
      await expect(matchRow).toContainText(/Scheduled/);

      // Record 25–10 via the per-row "Edit / record result" disclosure. This
      // drives recordResultFromForm → record_league_match_result (the
      // user-scoped, RLS-gated single-row UPDATE). The host passes
      // is_event_host_for_division, so the write lands.
      const editDetails = page
        .locator('details', { has: page.locator('summary', { hasText: /edit \/ record result/i }) })
        .first();
      await editDetails.locator('summary').click();
      await editDetails.locator('input[name="homeScore"]').fill('25');
      await editDetails.locator('input[name="awayScore"]').fill('10');
      await editDetails.locator('select[name="status"]').selectOption('completed');
      await editDetails.getByRole('button', { name: /record result/i }).click();
      await page.waitForURL(/notice=recorded/, { timeout: 15_000 });

      // The recorded score + "Final" status now show on the row.
      const recordedRow = page.locator('li').filter({ hasText: teams[0]! }).first();
      await expect(recordedRow).toContainText('25');
      await expect(recordedRow).toContainText('10');
      await expect(recordedRow).toContainText(/Final/);
    } finally {
      await deleteLeagueFixture(fx);
    }
  });
});

test.describe('league — the schedule is host-only (C2)', () => {
  test('a non-host viewer sees the schedule read-only (no add form, no result entry)', async ({
    page,
    browser,
  }) => {
    test.skip(
      !leagueFixtureAvailable(),
      'league fixture needs E2E_CLEANUP_SUPABASE_* + TEST_USER_EMAIL (leagues have no UI create path)',
    );
    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');
    test.setTimeout(120_000);

    const tag = Date.now().toString(36);
    const teams = [`E2E ${tag} Home`, `E2E ${tag} Away`];
    let fx: LeagueFixture | null = null;

    try {
      fx = await createLeagueFixture({ title: `E2E League Authz ${tag}`, teamNames: teams });

      // Host seeds one match so there is something to view.
      await page.goto(`/events/${fx.eventId}/schedule`);
      const when = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
      await page.locator('input[name="scheduledAt"]').fill(when);
      await page.locator('select[name="homeEntryId"]').selectOption(fx.teams[0]!.entryId);
      await page.locator('select[name="awayEntryId"]').selectOption(fx.teams[1]!.entryId);
      await page.getByRole('button', { name: /^add match$/i }).click();
      await page.waitForURL(/notice=added/, { timeout: 15_000 });

      // Host has the management affordances: the add form and a result-entry
      // disclosure.
      await expect(page.getByRole('heading', { name: /add a match/i })).toBeVisible();
      await expect(page.locator('summary', { hasText: /edit \/ record result/i })).toHaveCount(1);

      // attendee-b is neither host/co-host nor a captain of either team (the
      // host captains both). They may VIEW the public schedule but must get no
      // management UI — no add form, no result-entry disclosure, no score
      // inputs. (The schedule renders the result form only to hosts, so even a
      // captain wouldn't see it here; this asserts the UI-level gate.)
      await withAuthContext(browser, STORAGE_PATHS.attendeeB, async (bPage) => {
        await bPage.goto(`/events/${fx!.eventId}/schedule`);

        await expect(bPage.locator('li').filter({ hasText: teams[0]! }).first()).toBeVisible({
          timeout: 15_000,
        });
        await expect(bPage.getByRole('heading', { name: /add a match/i })).toHaveCount(0);
        await expect(bPage.locator('summary', { hasText: /edit \/ record result/i })).toHaveCount(
          0,
        );
        await expect(bPage.locator('input[name="homeScore"]')).toHaveCount(0);
      });
    } finally {
      await deleteLeagueFixture(fx);
    }
  });
});

test.describe('league — host forfeits and reinstates a team (C2)', () => {
  test('marking a league team forfeited toggles it, and reinstating reverts it', async ({
    page,
  }) => {
    test.skip(
      !leagueFixtureAvailable(),
      'league fixture needs E2E_CLEANUP_SUPABASE_* + TEST_USER_EMAIL (leagues have no UI create path)',
    );
    test.setTimeout(120_000);

    const tag = Date.now().toString(36);
    const teams = [`E2E ${tag} Spikers`, `E2E ${tag} Diggers`];
    let fx: LeagueFixture | null = null;

    // The "League teams" panel lives inside the collapsed "Host tools"
    // disclosure on the event detail page, which re-renders closed after every
    // forfeit-action redirect — so reopen it before each assertion.
    // Idempotent: the forfeit success path revalidates in place (no redirect,
    // unlike the schedule actions), so the disclosure may already be open after
    // an action. Only toggle it when it's currently closed.
    const openHostTools = async () => {
      const heading = page.getByRole('heading', { name: /league teams/i });
      if (!(await heading.isVisible().catch(() => false))) {
        await page.locator('summary', { hasText: /^Host tools$/ }).click();
      }
      await expect(heading).toBeVisible({ timeout: 15_000 });
    };
    const markForfeited = page.getByRole('button', { name: /mark forfeited/i });
    const reinstate = page.getByRole('button', { name: /^reinstate$/i });

    try {
      fx = await createLeagueFixture({ title: `E2E League Forfeit ${tag}`, teamNames: teams });

      await page.goto(`/events/${fx.eventId}`);
      await openHostTools();

      // Both teams start active → two "Mark forfeited" buttons, no "Reinstate".
      await expect(markForfeited).toHaveCount(2);
      await expect(reinstate).toHaveCount(0);

      // Forfeit one team. The action revalidates in place (the `?forfeit=`
      // flash only fires on error), so wait for the new button state, not a
      // navigation. `openHostTools` is idempotent in case the re-render reset
      // the disclosure.
      await markForfeited.first().click();
      await openHostTools();
      // Exactly one team is now forfeited (one Reinstate, one Mark forfeited).
      await expect(reinstate).toHaveCount(1, { timeout: 15_000 });
      await expect(markForfeited).toHaveCount(1);

      // Reinstate it → back to two active teams.
      await reinstate.first().click();
      await openHostTools();
      await expect(markForfeited).toHaveCount(2, { timeout: 15_000 });
      await expect(reinstate).toHaveCount(0);
    } finally {
      await deleteLeagueFixture(fx);
    }
  });
});
