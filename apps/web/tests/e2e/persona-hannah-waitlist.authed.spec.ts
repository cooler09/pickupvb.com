import { test, expect, type Page } from './_helpers/fixtures';
import { PERSONAS, withPersona, skipIfPersonaMissing } from './_helpers/personas';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { createFreeOpenPlayEvent, cancelEvent } from './_helpers/event-create';
import { deleteEventById } from './_helpers/cleanup';
import { expandSignupSection } from './_helpers/stripe';

/**
 * Hannah Schmidt (P15) — the waitlister (capacity edge). docs/personas.md.
 *
 * The capacity waitlist + auto-promotion shipped (ADR 0036). A *fixed-capacity*
 * open play that's full now offers a real `event_waitlist` queue: the signup
 * section shows "Full — join the waitlist below." with a "Join waitlist"
 * button, queued users see "You're #N on the waitlist", and the head of the
 * queue is **auto-promoted to a confirmed attendee** when a spot frees (the
 * leaving attendee's `save()` drains the waitlist via the `save_event` RPC).
 *
 * Hannah's workflow: a different account takes the only spot, Hannah joins the
 * waitlist (#1), then the spot-taker leaves and Hannah is promoted. The live
 * cross-viewer spot-count fixme stays `test.fixme` — that's the Supabase
 * Realtime path, deferred with the rest of the realtime suite.
 */

const hannah = PERSONAS.hannah;

/**
 * Click the RsvpPanel "Join this event" trigger and confirm in the in-app
 * `<dialog>` (a `ConfirmSubmitButton`). The trigger and the dialog's confirm
 * button share the label, so the confirm is scoped to the open dialog.
 */
async function joinViaConfirm(page: Page, eventUrl: string): Promise<void> {
  await page.goto(eventUrl);
  await page.waitForLoadState('domcontentloaded');
  await page
    .getByRole('button', { name: /join this event/i })
    .first()
    .click();
  await page
    .locator('dialog[open]')
    .getByRole('button', { name: /join this event/i })
    .click();
  await page.waitForLoadState('domcontentloaded');
}

/** Leave an event via the RsvpPanel "Leave event" `ConfirmSubmitButton` (same
 *  trigger/dialog shape as {@link joinViaConfirm}). */
async function leaveViaConfirm(page: Page, eventUrl: string): Promise<void> {
  await page.goto(eventUrl);
  await page.waitForLoadState('domcontentloaded');
  // Once "in", the signup <details> collapses and hides "Leave event" — reveal it.
  await expandSignupSection(page);
  await page
    .getByRole('button', { name: /leave event/i })
    .first()
    .click();
  await page
    .locator('dialog[open]')
    .getByRole('button', { name: /leave event/i })
    .click();
  await page.waitForLoadState('domcontentloaded');
}

test.describe(`${hannah.name} (${hannah.id}) — waitlister`, () => {
  test('discovers events to RSVP to', async ({ browser }) => {
    await withPersona(browser, 'hannah', async (page) => {
      const res = await page.goto('/events');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  test('joins the waitlist when full, then is auto-promoted when the spot frees', async ({
    page,
    browser,
  }) => {
    skipIfMissingAuth(STORAGE_PATHS.freeHost, 'free-host');
    skipIfPersonaMissing('hannah');
    test.slow();

    // free-host provisions a capacity-1 free open play and does NOT auto-join
    // (joinAsHost:false) so the single spot is open for a real contender.
    let created: { url: string; id: string } | null = null;
    const hostCtx = await browser.newContext({ storageState: STORAGE_PATHS.freeHost });
    const hostPage = await hostCtx.newPage();
    try {
      created = await createFreeOpenPlayEvent(hostPage, {
        title: `E2E Hannah Waitlist ${Date.now()}`,
        maxSpots: 1,
        joinAsHost: false,
      });

      // attendee-a (the per-worker default `page`) takes the only spot.
      await joinViaConfirm(page, created.url);
      await expect(page.getByText(/you're signed up/i)).toBeVisible({ timeout: 10_000 });

      await withPersona(browser, 'hannah', async (hPage) => {
        // Hannah arrives to a full event → the real waitlist affordance.
        await hPage.goto(created!.url);
        await hPage.waitForLoadState('domcontentloaded');
        await expandSignupSection(hPage);
        await expect(
          hPage.getByText(/full.*join the waitlist|join the waitlist below/i).first(),
        ).toBeVisible({ timeout: 10_000 });

        // Join the waitlist → queued at position #1, not on the roster.
        await hPage.getByRole('button', { name: /join waitlist/i }).click();
        await hPage.waitForLoadState('domcontentloaded');
        await expect(hPage.getByText(/you're #1 on the waitlist/i)).toBeVisible({
          timeout: 10_000,
        });
        await expect(hPage.getByText(/you're signed up/i)).toHaveCount(0);

        // attendee-a frees the only spot → the leave drains the waitlist and
        // promotes Hannah (the head) to a confirmed attendee (save_event).
        await leaveViaConfirm(page, created!.url);

        // On her next view Hannah is promoted off the waitlist onto the roster.
        // The collapsed signup summary flips to the signed-up state
        // ("You're in — view details"), and she's no longer queued ("#N on the
        // waitlist" is gone). Assert the visible summary rather than the
        // "You're signed up" pill, which is hidden inside the collapsed panel.
        await hPage.goto(created!.url);
        await hPage.waitForLoadState('domcontentloaded');
        await expect(hPage.getByText(/you're in/i).first()).toBeVisible({ timeout: 15_000 });
        await expect(hPage.getByText(/#\d+ on the waitlist/i)).toHaveCount(0);
      });
    } finally {
      if (created) {
        await cancelEvent(hostPage, created.url);
        await deleteEventById(created.id);
      }
      await hostCtx.close();
    }
  });

  // Live cross-viewer spot-count consistency is the Supabase Realtime path —
  // deferred with the rest of the realtime suite.
  test.fixme('live spot count stays consistent across two viewers (realtime)', async () => {});
});
