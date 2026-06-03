import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';

/**
 * Olivia Banks (P16) — the social connector / visibility-scoping hub.
 * docs/personas.md.
 *
 * Olivia has the densest friend graph in the test set, which makes her the
 * linchpin for visibility scoping: events set to `friends_of_host` /
 * `friends_of_attendees` should appear for her (positive) and NOT for an
 * unrelated viewer (negative). Those assertions need seeded friend edges + a
 * scoped event, so they're fixme; her social surfaces are runnable now.
 */

const olivia = PERSONAS.olivia;

test.describe(`${olivia.name} (${olivia.id}) — social connector`, () => {
  test('/friends loads without error', async ({ browser }) => {
    await withPersona(browser, 'olivia', async (page) => {
      const res = await page.goto('/friends');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
    });
  });

  test('/players directory loads', async ({ browser }) => {
    await withPersona(browser, 'olivia', async (page) => {
      const res = await page.goto('/players');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  // Visibility scoping (features.md § 3). Needs seeded friend edges (Olivia ↔
  // Mark / Amy / Adam) + an event scoped to friends_of_host / _of_attendees,
  // plus an unrelated viewer for the negative case. Documented intent:
  test.fixme('finds a friends_of_host event when she is friends with the host', async () => {});
  test.fixme('finds a friends_of_attendees event when a friend is attending', async () => {});
  test.fixme('an unrelated viewer CANNOT discover the same scoped event', async () => {});
  test.fixme('add/remove a friend; the self-friend invariant holds', async () => {});
});
