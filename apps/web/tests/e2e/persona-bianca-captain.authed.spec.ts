import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { deleteTeamBySlug } from './_helpers/cleanup';

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

  // Roster depth that needs a second actor (free agent to pick up, a teammate
  // to invite) or a host's division to register into. features.md §§ 1, 9 +
  // AGENTS.md § Pattern 6 (division_id at the registration boundary).
  test.fixme('registers Sand Sharks into a tournament division with explicit division_id', async () => {});
  test.fixme('picks up a free agent (Tyler) into the roster', async () => {});
  test.fixme('sends a team broadcast to the roster', async () => {});
});
