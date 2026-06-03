import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { findOwnedGroupUrl } from './_helpers/navigation';

/**
 * Steve Park (P3) — the co-host / group manager who is NOT the owner and has
 * no Stripe account of his own. docs/personas.md.
 *
 * Steve is the authorization-boundary persona. The headline assertions:
 *   - As a group ADMIN (not owner) he can reach the members page but the
 *     destructive "danger zone" (delete group / transfer ownership) is absent.
 *   - As a CO-HOST he can edit Mark's events and manage attendees…
 *   - …but payouts route to `events.host_id` (Mark), never the co-host —
 *     Steve's own billing/earnings is empty (AGENTS.md § Pattern 7).
 *
 * Several of these depend on seeded membership/co-host rows (Steve as admin of
 * VB Beach Club, co-host on a Mark event). They skip gracefully until that
 * state exists, and the multi-actor write paths stay fixme.
 */

const steve = PERSONAS.steve;

test.describe(`${steve.name} (${steve.id}) — co-host / group-admin boundary`, () => {
  test('as a group admin, can open the members page', async ({ browser }) => {
    await withPersona(browser, 'steve', async (page) => {
      const groupUrl = await findOwnedGroupUrl(page);
      if (!groupUrl) {
        test.skip(true, 'Steve is not listed on a group yet — seed him as admin of VB Beach Club');
      }
      const res = await page.goto(`${groupUrl}/members`);
      // Admin may manage members → page loads (not a 403/redirect to the group).
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/member|owner|admin|role/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test('as a group admin (not owner), the destructive danger zone is hidden', async ({
    browser,
  }) => {
    await withPersona(browser, 'steve', async (page) => {
      const groupUrl = await findOwnedGroupUrl(page);
      if (!groupUrl) {
        test.skip(true, 'Steve is not listed on a group yet — seed him as admin of VB Beach Club');
      }
      await page.goto(`${groupUrl}/edit`);
      await page.waitForLoadState('domcontentloaded');
      // Owner-only controls: deleting the group / transferring ownership.
      const hasDelete = await isVisibleOrTimeout(
        page.getByRole('button', { name: /delete group|transfer ownership/i }).first(),
        2_000,
      );
      expect(hasDelete).toBe(false);
    });
  });

  test('can host his own event (co-host role does not block self-hosting)', async ({ browser }) => {
    await withPersona(browser, 'steve', async (page) => {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain('/events/new');
      await expect(page.getByRole('button', { name: /create event/i })).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  // These need a seeded co-host row on a Mark-hosted event (a second actor's
  // resource). Documented intent — AGENTS.md § Pattern 7 + features.md § 2.
  test.fixme('co-host can edit a Mark-hosted event and manage its attendees', async () => {});
  test.fixme('co-host can send a host broadcast on a co-hosted event', async () => {});
  test.fixme('co-host cannot see payout/earnings for the host (payouts route to events.host_id)', async () => {});
});
