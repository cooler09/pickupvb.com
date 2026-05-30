import { test, expect } from './_helpers/fixtures';

/**
 * Tournament feature flows (Section 6 of the test plan).
 *
 * Most tournament interactions (team creation, bracket management) require:
 *   - A tournament-type event in the dev DB
 *   - Multiple test accounts
 *   - Stripe Connect for paid team registration
 *
 * Read-only tests run against the persistent fixture seeded by
 * supabase/snippets/seed-tournament-fixture.sql (short codes E2ETFA /
 * E2ETFR — see apps/web/tests/e2e/README.md group #4). Mutating tests
 * remain `test.fixme` to avoid polluting the persistent seed; converting
 * them needs a per-test create+cleanup strategy or a dedicated
 * disposable fixture.
 */

// Short codes from supabase/snippets/seed-tournament-fixture.sql.
const ADHOC_CODE = 'E2ETFA';
const ROSTER_CODE = 'E2ETFR';

async function resolveEventId(
  page: import('@playwright/test').Page,
  shortCode: string,
): Promise<string> {
  const response = await page.goto(`/e/${shortCode}`);
  expect(response?.ok(), `/e/${shortCode} did not resolve — is the seed applied?`).toBeTruthy();
  await page.waitForURL(/\/events\/[0-9a-f-]+(\?|$)/, { timeout: 10_000 });
  const match = /\/events\/([0-9a-f-]+)/.exec(page.url());
  expect(
    match?.[1],
    `expected canonical /events/<uuid> after /e/${shortCode} redirect`,
  ).toBeTruthy();
  return match![1]!;
}

test.describe('tournament event page (seeded fixture)', () => {
  test('roster fixture /e/E2ETFR loads and lists the four seeded teams', async ({ page }) => {
    await resolveEventId(page, ROSTER_CODE);
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText(/internal server error/i);

    // Title comes from the seed.
    await expect(page.locator('body')).toContainText(/Roster Tournament Fixture/i);

    // All four persistent team names from the seed should be present.
    for (const teamName of ['[E2E] Spikers', '[E2E] Diggers', '[E2E] Setters', '[E2E] Blockers']) {
      await expect(page.locator('body')).toContainText(teamName);
    }
  });

  test('roster fixture bracket page loads with division summary and team count', async ({
    page,
  }) => {
    const eventId = await resolveEventId(page, ROSTER_CODE);

    const response = await page.goto(`/events/${eventId}/bracket`);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).not.toContainText(/internal server error/i);

    // Bracket page header: "Bracket — <event title>"
    await expect(
      page.getByRole('heading', { level: 1, name: /Bracket\s+—\s+\[E2E\] Roster/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Each division in the seed has 2 registered teams.
    await expect(page.locator('body')).toContainText(/2 registered teams?/i);
  });

  test('ad-hoc fixture /e/E2ETFA loads with no pre-registered teams', async ({ page }) => {
    await resolveEventId(page, ADHOC_CODE);
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText(/internal server error/i);

    // Title from the seed.
    await expect(page.locator('body')).toContainText(/Ad-Hoc Tournament Fixture/i);

    // No persistent team names should be on this fixture.
    await expect(page.locator('body')).not.toContainText('[E2E] Spikers');
  });
});

test.describe('ad-hoc team registration', () => {
  test.fixme(
    'click "Register team" on a tournament event → enter name → team appears on page → creator is captain',
  );

  test.fixme('captain adds a player to the team → player appears on roster on event page');

  test.fixme('player removes themselves from the team');

  test.fixme('captain renames the team — updated name shows everywhere on event page');

  test.fixme('captain withdraws the team — team disappears from event');
});

test.describe('pre-rostered team registration', () => {
  test.fixme(
    'team captain registers a pre-rostered team to a tournament — team appears in event team list with full roster',
  );

  test.fixme('captain withdraws pre-rostered team from event');
});

test.describe('paid team registration', () => {
  test.fixme(
    'paid team registration → Stripe Checkout for team fee → team registered and marked paid',
  );
});

test.describe('free agent signup', () => {
  test.fixme(
    'sign up as free agent on a tournament with free-agent mode → listed in free-agents section',
  );

  test.fixme('host assigns a free agent to a team → free agent appears on assigned team');
});

test.describe('bracket management', () => {
  test.fixme(
    'host sets seeding → "Generate bracket" → bracket renders with all teams → record match result → winner advances',
  );

  test.fixme(
    'reset a recorded match result → match reverts to unplayed → downstream results cleared',
  );

  test.fixme('record all matches → champion displayed → bracket fully resolved');

  test.fixme('division winner recorded → displayed on event page');
});
