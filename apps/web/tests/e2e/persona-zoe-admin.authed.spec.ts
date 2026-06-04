import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona, skipIfPersonaMissing } from './_helpers/personas';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { isVisibleOrTimeout } from './_helpers/predicates';
import {
  adminHideListing,
  adminUnhideListing,
  createThrowawayListing,
  deleteThrowawayListing,
  type ThrowawayListing,
} from './_helpers/community';

/**
 * Zoe Carter (P18) — the platform admin. docs/personas.md.
 *
 * Zoe adopts the admin account (TEST_ADMIN_EMAIL / admin.json). The hide/unhide
 * moderation flow is implemented here as a persona-lens test (a throwaway
 * listing owned by attendee-b, moderated by Zoe). The claim-approval and
 * role-escalation flows stay fixme — see the notes at the bottom for what each
 * needs (claim approval is a multi-actor flow; role escalation has no admin UI
 * surface today).
 */

const zoe = PERSONAS.zoe;

test.describe(`${zoe.name} (${zoe.id}) — platform admin`, () => {
  test('admin badge renders on /profile', async ({ browser }) => {
    await withPersona(browser, 'zoe', async (page) => {
      await page.goto('/profile');
      await page.waitForLoadState('domcontentloaded');
      // AdminBadge: <span aria-label="Platform admin — …">Admin</span>.
      const badge = page.locator('[aria-label*="Platform admin"]').first();
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toContainText('Admin');
    });
  });

  test('an admin-only surface is reachable (not bounced to /login)', async ({ browser }) => {
    await withPersona(browser, 'zoe', async (page) => {
      // The community-import tool is the one first-class /admin page.
      await page.goto('/admin/community-import');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).not.toContain('/login');
      // .first() — a 404 page would also render a <main>, tripping strict mode.
      await expect(page.locator('main').first()).toBeVisible({ timeout: 10_000 });
      // …and it must be the admin tool, not the 404 page.
      await expect(page.locator('body')).not.toContainText(/page not found/i);
    });
  });

  test('hides a reported community listing (gone from the public directory), then unhides it', async ({
    browser,
  }) => {
    skipIfPersonaMissing('zoe');
    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');
    test.setTimeout(120_000);

    // attendee-b creates a throwaway listing for Zoe to moderate.
    const bCtx = await browser.newContext({ storageState: STORAGE_PATHS.attendeeB });
    const bPage = await bCtx.newPage();
    let listing: ThrowawayListing | null = null;
    try {
      listing = await createThrowawayListing(bPage, `E2E Zoe Mod ${Date.now()}`);
      if (!listing) {
        test.skip(true, '/community/new not reachable for attendee-b; skipping');
      }
      const titleRe = new RegExp(listing!.title, 'i');

      // Zoe hides it, then confirms it has vanished from the public directory
      // (a fresh anonymous context — no admin cookies leak in).
      await withPersona(browser, 'zoe', async (zPage) => {
        await zPage.goto(listing!.url);
        await zPage.waitForLoadState('domcontentloaded');
        await adminHideListing(zPage);

        const publicCtx = await browser.newContext();
        const publicPage = await publicCtx.newPage();
        try {
          await publicPage.goto('/community');
          await publicPage.waitForLoadState('domcontentloaded');
          const stillListed = await isVisibleOrTimeout(
            publicPage.getByText(titleRe).first(),
            5_000,
          );
          expect(stillListed, 'a hidden listing must not appear in public /community').toBe(false);
        } finally {
          await publicCtx.close();
        }

        // Admin can still reach it directly, and it shows the hidden state…
        await zPage.goto(listing!.url);
        await zPage.waitForLoadState('domcontentloaded');
        await expect(zPage.locator('main')).toContainText(/hidden|removed|not visible/i, {
          timeout: 10_000,
        });

        // …then Zoe restores it.
        await adminUnhideListing(zPage);
      });
    } finally {
      if (listing) await deleteThrowawayListing(bPage, listing.url);
      await bCtx.close();
    }
  });

  // Still fixme:
  //  - Claim approval is a multi-actor flow: a claimant who HOSTS an upcoming
  //    PickupVB event files a claim linking this external listing to that event
  //    (claimListing(listingId, userId, eventId)), then Zoe approves. It needs a
  //    second actor with a live event + the claim form's event picker, so it
  //    lives with the other deep moderation in admin.authed.spec.ts.
  //  - Role escalation has no admin UI surface today (the only first-class
  //    /admin page is /admin/community-import). Promoting/demoting a platform
  //    admin is a DB/SQL operation, so there is nothing to drive through the UI
  //    until an admin user-management page exists.
  test.fixme('approves a community-listing claim', async () => {});
  test.fixme('escalates / de-escalates a user role', async () => {});
});
