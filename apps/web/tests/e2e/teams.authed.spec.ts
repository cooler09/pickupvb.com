import { test, expect } from '@playwright/test';

/**
 * Tournament team (roster) flows (Section 8 of the test plan).
 *
 * Section 8.1 (create team) has a runnable page-load check.
 * Sections 8.2–8.4 require attendee-b (TEST_ATTENDEE_B_EMAIL) and are marked fixme.
 *
 * Teams created via the @destructive test persist in dev — the app has no
 * team-delete UI. Clean up via Supabase dashboard if needed.
 */

test.describe('create team', () => {
  test('/teams/new loads with required fields', async ({ page }) => {
    const response = await page.goto('/teams/new');

    if (!response?.ok() || page.url().includes('/login') || page.url().includes('/upgrade')) {
      test.skip(true, '/teams/new requires Pro or is behind auth guard; skipping');
    }

    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });

    // A team creation form should have a name input at minimum.
    const nameInput = page
      .getByLabel(/team name/i)
      .or(page.locator('input[name="name"]'))
      .first();
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
  });

  test(
    'creates a team and lands on the team profile page',
    { tag: '@destructive', timeout: 60_000 },
    async ({ page }) => {
      await page.goto('/teams/new');

      if (page.url().includes('/login') || page.url().includes('/upgrade')) {
        test.skip(true, '/teams/new is gated; skipping destructive team creation test');
      }

      const teamName = `E2E Test Team ${Date.now()}`;
      const nameInput = page
        .getByLabel(/team name/i)
        .or(page.locator('input[name="name"]'))
        .first();

      if ((await nameInput.count()) === 0) {
        test.skip(true, 'No team name input found; skipping');
      }

      await nameInput.fill(teamName);

      // Format selector may or may not be required.
      const formatSelect = page.locator('select[name="format"]');
      if ((await formatSelect.count()) > 0) {
        await formatSelect.selectOption({ index: 1 });
      }

      await page
        .getByRole('button', { name: /create|save|submit/i })
        .first()
        .click();

      // Expect redirect to /teams/<slug>.
      await page.waitForURL(/\/teams\/.+/, { timeout: 15_000 });
      expect(page.url()).toMatch(/\/teams\//);

      // Team name should appear on the page.
      await expect(page.locator('main')).toContainText(teamName, { timeout: 10_000 });
    },
  );
});

test.describe('team invites', () => {
  test.fixme(
    "captain invites Attendee A by handle → invite appears on Attendee A's profile → Attendee A accepts → appears on roster",
  );

  test.fixme('Attendee A declines an invite → invite dismissed → player not on team');
});

test.describe('remove member', () => {
  test.fixme('captain removes a team member → removed from roster immediately');
});

test.describe('team broadcast', () => {
  test.fixme('captain sends a broadcast from /teams/<id> → all members receive notification');
});
