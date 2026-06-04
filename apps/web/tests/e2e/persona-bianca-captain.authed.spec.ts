import { test, expect } from './_helpers/fixtures';
import {
  PERSONAS,
  withPersona,
  personaEmail,
  personaStorage,
  skipIfPersonaMissing,
} from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { ensureSearchableDisplayName } from './_helpers/navigation';
import { deleteTeamBySlug } from './_helpers/cleanup';
import { expandSignupSection } from './_helpers/stripe';
import {
  createRosterTournamentFixture,
  deleteRosterTournamentFixture,
  rosterTournamentFixtureAvailable,
  type RosterTournamentFixture,
} from './_helpers/roster-tournament';

/**
 * Bianca Flores (P10) — the team captain (Sand Sharks). docs/personas.md.
 *
 * Bianca is the roster-manager persona: she builds a team, registers it for
 * tournaments and a league division, picks up free agents, and broadcasts to
 * the roster. The team-create + captain soft-delete arc is fully runnable in
 * her own context (modelled on teams.authed.spec.ts's @destructive create);
 * the multi-actor and division-signup depth stays fixme.
 *
 * Note: /teams/new is Pro-gated on some builds — if Bianca's account isn't
 * Pro, the create page redirects to /upgrade and the test skips gracefully.
 */

const bianca = PERSONAS.bianca;

test.describe(`${bianca.name} (${bianca.id}) — team captain`, () => {
  test('/teams/new loads with a team-name field', async ({ browser }) => {
    await withPersona(browser, 'bianca', async (page) => {
      const res = await page.goto('/teams/new');
      if (!res?.ok() || page.url().includes('/login') || page.url().includes('/upgrade')) {
        test.skip(true, '/teams/new is gated (Pro/auth) for this account on this environment');
      }
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      const nameInput = page
        .getByLabel(/team name/i)
        .or(page.locator('input[name="name"]'))
        .first();
      await expect(nameInput).toBeVisible({ timeout: 10_000 });
    });
  });

  test(
    'creates a team, lands on its page, then soft-deletes it',
    { tag: '@destructive' },
    async ({ browser }) => {
      test.setTimeout(90_000);
      await withPersona(browser, 'bianca', async (page) => {
        await page.goto('/teams/new');
        if (page.url().includes('/login') || page.url().includes('/upgrade')) {
          test.skip(true, '/teams/new is gated; skipping destructive create');
        }

        const teamName = `E2E Persona Bianca ${Date.now()}`;
        const nameInput = page
          .getByLabel(/team name/i)
          .or(page.locator('input[name="name"]'))
          .first();
        if ((await nameInput.count()) === 0) {
          test.skip(true, 'No team name input found; skipping');
        }
        await nameInput.fill(teamName);

        const formatSelect = page.locator('select[name="format"]');
        if ((await formatSelect.count()) > 0) await formatSelect.selectOption({ index: 1 });

        await page
          .getByRole('button', { name: /create|save|submit/i })
          .first()
          .click();
        await page.waitForURL(/\/teams\/.+/, { timeout: 15_000 });
        await expect(page.locator('main')).toContainText(teamName, { timeout: 10_000 });

        const teamUrl = page.url();
        const slug = teamUrl.match(/\/teams\/([^/?#]+)/)?.[1];
        try {
          // Captain-only soft-delete via the danger-zone panel.
          const openDeleteBtn = page.getByRole('button', { name: /^delete team…?$/i });
          if (await isVisibleOrTimeout(openDeleteBtn, 5_000)) {
            await openDeleteBtn.click();
            await page.getByRole('button', { name: /yes, delete team/i }).click();
            await page.waitForURL(/\/teams(\?.*)?$/, { timeout: 15_000 });
            expect(page.url()).toMatch(/[?&]deleted=1/);
          }
        } finally {
          // Belt + suspenders: admin hard-delete (no-op without cleanup creds).
          if (slug) await deleteTeamBySlug(slug);
        }
      });
    },
  );

  test('registers Sand Sharks into a tournament division with explicit division_id', async ({
    browser,
  }) => {
    skipIfPersonaMissing('bianca');
    const hostEmail = process.env['TEST_FREE_HOST_EMAIL'] ?? process.env['TEST_USER_EMAIL'];
    const captainEmail = personaEmail('bianca');
    test.skip(
      !rosterTournamentFixtureAvailable(hostEmail, captainEmail),
      'roster-tournament fixture needs E2E_CLEANUP_SUPABASE_* + a host email + TEST_CAPTAIN_EMAIL (the tournament + Bianca’s team are admin-provisioned)',
    );
    test.setTimeout(120_000);

    const tag = Date.now().toString(36);
    let fx: RosterTournamentFixture | null = null;
    try {
      fx = await createRosterTournamentFixture({
        title: `E2E Bianca Register ${tag}`,
        hostEmail: hostEmail!,
        captainEmail: captainEmail!,
        teamName: `Sand Sharks ${tag}`,
      });

      await withPersona(browser, 'bianca', async (page) => {
        await page.goto(`/events/${fx!.eventId}`);
        await page.waitForLoadState('domcontentloaded');

        // The "Register" section is a collapsible <details> that defaults
        // collapsed for a captain (Bianca captains Sand Sharks → `viewerRegistered`),
        // hiding the controls. Force it open before driving the panel.
        await expandSignupSection(page);

        // The form posts `division_id` (AGENTS.md Pattern 6). This fixture has a
        // single division, so it rides a hidden input; the multi-division
        // "lands in the chosen division" assertion is owned by the divisions
        // phase (C4). Drive the panel and confirm the registration lands.
        await page.getByRole('radio', { name: /register a team/i }).click();
        const teamSelect = page.locator('select[name="team_id"]');
        await expect(teamSelect).toBeVisible({ timeout: 10_000 });
        await teamSelect.selectOption(fx!.teamId);
        await page.getByRole('button', { name: /register team/i }).click();

        await expect(page.getByText(/your team is registered/i)).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText(fx!.teamName).first()).toBeVisible({ timeout: 10_000 });
      });
    } finally {
      await deleteRosterTournamentFixture(fx);
    }
  });

  // There is NO first-class free-agent → roster "pickup" (Tier C finding): the
  // pool (FreeAgentSignupPanel) is advertise-only and free-agent-actions.ts has
  // only join/leave. A captain rosters a free agent through the generic team
  // invite (teams/actions.ts addMemberFromForm → team.invite notify → accept).
  // This drives the full persona narrative end-to-end across two actors and
  // asserts the seam: inviting Tyler does NOT clear his free-agent pool entry
  // (pool and roster stay disconnected). See docs/audits/e2e-tests.md.
  test('picks up free-agent Tyler via the team invite; Tyler is notified; pool entry persists', async ({
    browser,
  }) => {
    skipIfPersonaMissing('bianca');
    skipIfPersonaMissing('tyler');
    const hostEmail = process.env['TEST_FREE_HOST_EMAIL'] ?? process.env['TEST_USER_EMAIL'];
    const captainEmail = personaEmail('bianca');
    test.skip(
      !rosterTournamentFixtureAvailable(hostEmail, captainEmail),
      'pickup fixture needs E2E_CLEANUP_SUPABASE_* + a host email + TEST_CAPTAIN_EMAIL (Bianca) + TEST_FREE_AGENT_EMAIL (Tyler)',
    );
    test.setTimeout(180_000);

    const tag = Date.now().toString(36);
    let fx: RosterTournamentFixture | null = null;
    // Two simultaneous actors → manage both contexts by hand (withPersona closes
    // its context on return, so it can't host an interleaved two-actor flow).
    const tylerCtx = await browser.newContext({ storageState: personaStorage('tyler') });
    const biancaCtx = await browser.newContext({ storageState: personaStorage('bianca') });
    const tylerPage = await tylerCtx.newPage();
    const biancaPage = await biancaCtx.newPage();
    try {
      fx = await createRosterTournamentFixture({
        title: `E2E Bianca Pickup ${tag}`,
        hostEmail: hostEmail!,
        captainEmail: captainEmail!,
        teamName: `Sand Sharks ${tag}`,
      });

      // 1. Tyler takes a unique searchable name, then advertises in the pool.
      const tylerName = await ensureSearchableDisplayName(tylerPage, 'E2E Tyler');
      await tylerPage.goto(`/events/${fx.eventId}`);
      await tylerPage.waitForLoadState('domcontentloaded');
      await expandSignupSection(tylerPage); // "Register" section can default collapsed
      await tylerPage.getByRole('radio', { name: /sign up solo/i }).click();
      await tylerPage.getByRole('button', { name: /sign up as free agent/i }).click();
      await expect(tylerPage.getByText(/you're signed up as a free agent/i)).toBeVisible({
        timeout: 10_000,
      });

      // 2. Bianca invites Tyler to her team via the UserPicker.
      await biancaPage.goto(`/teams/${fx.teamSlug}`);
      await biancaPage.waitForLoadState('domcontentloaded');
      const combobox = biancaPage.getByRole('combobox').first();
      await expect(combobox).toBeVisible({ timeout: 10_000 });
      await combobox.fill(tylerName);
      const option = biancaPage.getByRole('listbox').first().getByRole('option').first();
      await expect(option).toBeVisible({ timeout: 10_000 });
      await option.click();
      await biancaPage
        .getByRole('button', { name: /add teammate|add member/i })
        .first()
        .click();
      await biancaPage.waitForLoadState('domcontentloaded');
      await expect(biancaPage.locator('main')).toContainText(/pending invite/i, {
        timeout: 10_000,
      });

      // 3. Tyler is notified ("Invited to Sand Sharks …") — assert from a neutral
      // page so the match is the bell, not the team name on the team page.
      await tylerPage.goto('/profile');
      await tylerPage.waitForLoadState('domcontentloaded');
      const bell = tylerPage
        .getByRole('button', { name: /notifications?|bell/i })
        .or(tylerPage.locator('[aria-label*="notification"]'))
        .first();
      await bell.click();
      await expect(tylerPage.getByText(new RegExp(`invited to .*${tag}`, 'i')).first()).toBeVisible(
        { timeout: 10_000 },
      );

      // 4. Tyler accepts the invite on the team page.
      await tylerPage.goto(`/teams/${fx.teamSlug}`);
      await tylerPage.waitForLoadState('domcontentloaded');
      const acceptBtn = tylerPage.getByRole('button', { name: /accept invite/i }).first();
      await expect(acceptBtn).toBeVisible({ timeout: 10_000 });
      await acceptBtn.click();
      await tylerPage.waitForLoadState('domcontentloaded');

      // 5. Bianca sees Tyler as an active member (no longer pending).
      await biancaPage.goto(`/teams/${fx.teamSlug}`);
      await biancaPage.waitForLoadState('domcontentloaded');
      const memberRow = biancaPage.locator('li, tr').filter({ hasText: tylerName }).first();
      await expect(memberRow).toBeVisible({ timeout: 10_000 });
      await expect(memberRow).not.toContainText(/pending invite/i);

      // 6. The seam: joining a team does NOT remove Tyler from the free-agent
      // pool — his name still appears in the event's "Available" list.
      await tylerPage.goto(`/events/${fx.eventId}`);
      await tylerPage.waitForLoadState('domcontentloaded');
      await expandSignupSection(tylerPage); // "Register" section can default collapsed
      await tylerPage.getByRole('radio', { name: /sign up solo/i }).click();
      await expect(tylerPage.getByText(tylerName).first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await tylerCtx.close();
      await biancaCtx.close();
      await deleteRosterTournamentFixture(fx);
    }
  });
  // Pointer, not a gap — the captain broadcast-to-roster flow is owned by
  // teams.authed.spec.ts › "captain sends a broadcast after attendee-b joins".
  test.fixme('sends a team broadcast to the roster — see teams.authed.spec.ts', async () => {});
});
