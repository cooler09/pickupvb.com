import { test, expect } from '@playwright/test';

/**
 * Tournament feature flows (Section 6 of the test plan).
 *
 * Most tournament interactions (team creation, bracket management) require:
 *   - A tournament-type event in the dev DB
 *   - Multiple test accounts
 *   - Stripe Connect for paid team registration
 *
 * Runnable tests verify that tournament-adjacent pages and UI elements load
 * without errors. All interactive flows are fixme until the above prerequisites
 * can be set up reliably.
 */

test.describe('tournament event page', () => {
  test('a tournament event page loads without error', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    // Look for a tournament-type event link.
    // Tournament events often display "Tournament" in their title or type badge.
    const eventLinks = page.locator('a[href*="/events/"]');
    const count = await eventLinks.count();

    let tournamentUrl: string | null = null;
    for (let i = 0; i < count; i++) {
      const text = await eventLinks.nth(i).textContent();
      if (/tournament|bracket/i.test(text ?? '')) {
        tournamentUrl = await eventLinks.nth(i).getAttribute('href');
        break;
      }
    }

    if (!tournamentUrl) {
      test.skip(true, 'No tournament events in this environment; skipping');
    }

    const response = await page.goto(tournamentUrl!);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
  });

  test('bracket page loads for a tournament event if one exists', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    const eventLinks = page.locator('a[href*="/events/"]');
    const count = await eventLinks.count();

    for (let i = 0; i < count; i++) {
      const text = await eventLinks.nth(i).textContent();
      if (/tournament|bracket/i.test(text ?? '')) {
        const href = await eventLinks.nth(i).getAttribute('href');
        if (!href) continue;

        // Try loading the bracket sub-page.
        const bracketUrl = `${href.replace(/\/$/, '')}/bracket`;
        const response = await page.goto(bracketUrl);
        // Bracket page may 404 if no bracket exists yet — that's acceptable.
        const status = response?.status() ?? 0;
        expect(status === 200 || status === 404 || status === 302).toBe(true);
        await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
        return;
      }
    }

    test.skip(true, 'No tournament events in this environment; skipping bracket page test');
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
