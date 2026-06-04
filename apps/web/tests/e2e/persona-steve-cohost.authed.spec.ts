import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona, personaEmail, skipIfPersonaMissing } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { findOwnedGroupUrl } from './_helpers/navigation';
import {
  createCoHostedEvent,
  deleteCoHostedEvent,
  coHostedEventFixtureAvailable,
  type CoHostedEventFixture,
} from './_helpers/co-hosted-event';

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

  test('co-host can reach the edit + manage pages of a Mark-hosted event', async ({ browser }) => {
    test.skip(
      !coHostedEventFixtureAvailable(),
      'co-host fixture needs E2E_CLEANUP_SUPABASE_* (the event + event_co_hosts row are admin-provisioned)',
    );
    skipIfPersonaMissing('steve');
    const hostEmail = process.env['TEST_PRO_HOST_EMAIL'];
    const coHostEmail = personaEmail('steve');
    if (!hostEmail) test.skip(true, 'needs TEST_PRO_HOST_EMAIL (the primary host, Mark)');
    if (!coHostEmail) test.skip(true, 'needs TEST_CO_HOST_EMAIL (Steve)');
    test.setTimeout(120_000);

    let fx: CoHostedEventFixture | null = null;
    try {
      fx = await createCoHostedEvent({
        title: `E2E Steve CoHost ${Date.now()}`,
        hostEmail: hostEmail!,
        coHostEmail: coHostEmail!,
      });

      await withPersona(browser, 'steve', async (page) => {
        // The edit page redirects non-managers to the public detail; a co-host
        // is a manager (server `event.canManage` includes co-hosts), so Steve
        // stays on /edit with an editable form.
        await page.goto(`/events/${fx!.eventId}/edit`);
        await page.waitForLoadState('domcontentloaded');
        expect(page.url()).toContain('/edit');
        await expect(page.locator('#title')).toBeEditable({ timeout: 10_000 });

        // …and the host manage dashboard (`notFound()` for non-managers) renders.
        await page.goto(`/events/${fx!.eventId}/manage`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('body')).not.toContainText(/page not found/i);
      });
    } finally {
      await deleteCoHostedEvent(fx);
    }
  });

  test('payouts route to the primary host — the event never shows in the co-host’s earnings', async ({
    browser,
  }) => {
    test.skip(!coHostedEventFixtureAvailable(), 'co-host fixture needs E2E_CLEANUP_SUPABASE_*');
    skipIfPersonaMissing('steve');
    const hostEmail = process.env['TEST_PRO_HOST_EMAIL'];
    const coHostEmail = personaEmail('steve');
    if (!hostEmail) test.skip(true, 'needs TEST_PRO_HOST_EMAIL (the primary host, Mark)');
    if (!coHostEmail) test.skip(true, 'needs TEST_CO_HOST_EMAIL (Steve)');
    test.setTimeout(120_000);

    let fx: CoHostedEventFixture | null = null;
    try {
      const title = `E2E Steve Payout ${Date.now()}`;
      fx = await createCoHostedEvent({ title, hostEmail: hostEmail!, coHostEmail: coHostEmail! });

      await withPersona(browser, 'steve', async (page) => {
        const res = await page.goto('/profile/billing/earnings');
        expect(res?.ok()).toBeTruthy();
        await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
        // Payouts route to `events.host_id` (Mark), never the co-host (AGENTS.md
        // Pattern 7), so the co-hosted event must NOT appear in Steve's earnings.
        await expect(page.getByText(title)).toHaveCount(0);
      });
    } finally {
      await deleteCoHostedEvent(fx);
    }
  });

  // Still fixme — a co-host CANNOT send a host broadcast today: the
  // `broadcasts_insert_event_host` RLS policy checks `events.host_id = auth.uid()`
  // only (no `event_co_hosts` / host-group branch), so `sendEventBroadcast`
  // returns an error for a co-host. This is a **feature/RLS decision**, not a
  // test gap — extend the broadcasts insert policy (and the panel's render gate)
  // to co-hosts before un-fixme-ing. See docs/audits/e2e-tests.md (persona fixme
  // backlog).
  test.fixme('co-host can send a host broadcast on a co-hosted event', async () => {});
});
