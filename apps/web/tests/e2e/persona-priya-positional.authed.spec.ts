import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';

/**
 * Priya Nair (P12) — the positional player (libero). docs/personas.md.
 *
 * Priya cares which positions are filled before she commits, and relies on her
 * profile position defaults to pre-fill the slot. Her profile positions are
 * runnable to assert; the positional RSVP + position-roster + over-fill→
 * waitlist flow needs a positional open-play event seeded with positions
 * enabled, so it stays fixme (mirrors event-attendance.authed.spec.ts § 5.2).
 */

const priya = PERSONAS.priya;

test.describe(`${priya.name} (${priya.id}) — positional player`, () => {
  test('/profile exposes the primary/secondary/tertiary position fields', async ({ browser }) => {
    await withPersona(browser, 'priya', async (page) => {
      await page.goto('/profile');
      await page.waitForLoadState('domcontentloaded');
      // Expand the edit form if it's behind a <summary>.
      const editSummary = page
        .locator('details summary')
        .filter({ hasText: /edit profile/i })
        .first();
      if (await isVisibleOrTimeout(editSummary, 3_000)) await editSummary.click();

      const hasPositionField = await isVisibleOrTimeout(
        page
          .locator('select[name*="position"], input[name*="position"], [name="primary_position"]')
          .or(page.getByText(/setter|outside|opposite|middle|libero|defensive/i))
          .first(),
        5_000,
      );
      expect(hasPositionField).toBe(true);
    });
  });

  test('discovers events (positional or otherwise)', async ({ browser }) => {
    await withPersona(browser, 'priya', async (page) => {
      const res = await page.goto('/events');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  // Needs a positional open-play fixture (host enabled setter/outside/opposite/
  // middle/libero/DS slots). features.md § 2 (positional sign-up).
  test.fixme('RSVPs into the libero slot of a positional open play', async () => {});
  test.fixme('sees the position roster and the over-fill → waitlist behaviour', async () => {});
});
