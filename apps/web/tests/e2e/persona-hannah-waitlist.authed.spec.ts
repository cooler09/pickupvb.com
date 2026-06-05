import { test, expect, type Page } from './_helpers/fixtures';
import { PERSONAS, withPersona, skipIfPersonaMissing } from './_helpers/personas';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { createFreeOpenPlayEvent, cancelEvent } from './_helpers/event-create';
import { deleteEventById } from './_helpers/cleanup';

/**
 * Hannah Schmidt (P15) — the waitlister (capacity edge). docs/personas.md.
 *
 * Reality check against the domain (2026-06-04): the only "waitlist" the code
 * implements today is the **position-roster over-fill** badge (Priya's domain —
 * `position-rsvp-panel.tsx`). A *fixed-capacity* open play has no waitlist queue
 * and **no auto-promotion**: `JoinEventCommand` throws `CapacityExceededError`
 * when the event is full, and `rsvp-actions.ts` maps that to the `?rsvp=full`
 * flash ("Sorry — this event is full."). The signup section still *frames* a
 * full event as a waitlist ("Full — join the waitlist below."), but the join is
 * rejected — there is no `event_waitlist` table, promote RPC, or leave→promote
 * handler anywhere in `packages/domain` / `packages/application`.
 *
 * So Hannah's honest, runnable workflow is the capacity boundary from the
 * contender's seat: a different account takes the only spot, then Hannah hits
 * the full wall. The auto-promote + realtime fixmes stay `test.fixme` because
 * the underlying feature isn't built — see the notes below so the next agent
 * doesn't chase a flow that doesn't exist yet.
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

test.describe(`${hannah.name} (${hannah.id}) — waitlister`, () => {
  test('discovers events to RSVP to', async ({ browser }) => {
    await withPersona(browser, 'hannah', async (page) => {
      const res = await page.goto('/events');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  test('RSVP to a full (capacity-1) event is blocked with the "full" state', async ({
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
        title: `E2E Hannah Capacity ${Date.now()}`,
        maxSpots: 1,
        joinAsHost: false,
      });

      // attendee-a (the per-worker default `page`) takes the only spot.
      await joinViaConfirm(page, created.url);
      await expect(page.getByText(/you're signed up/i)).toBeVisible({ timeout: 10_000 });

      // Hannah arrives to a full event. The signup section frames it as a
      // waitlist, but the domain has no capacity queue, so the join is rejected.
      await withPersona(browser, 'hannah', async (hPage) => {
        await hPage.goto(created!.url);
        await hPage.waitForLoadState('domcontentloaded');
        // The full-event framing is visible to the contender.
        await expect(
          hPage.getByText(/full.*join the waitlist|join the waitlist below/i).first(),
        ).toBeVisible({ timeout: 10_000 });

        // Attempting to join is rejected with the "full" flash…
        await joinViaConfirm(hPage, created!.url);
        await expect(hPage.getByText(/this event is full/i)).toBeVisible({ timeout: 10_000 });
        // …and Hannah is NOT added to the roster.
        await expect(hPage.getByText(/you're signed up/i)).toHaveCount(0);
      });
    } finally {
      if (created) {
        await cancelEvent(hostPage, created.url);
        await deleteEventById(created.id);
      }
      await hostCtx.close();
    }
  });

  // Still fixme — the underlying feature does not exist in the domain yet:
  //  - There is no capacity waitlist queue and no auto-promotion. A full
  //    fixed-capacity join throws CapacityExceededError (see the test above);
  //    nothing promotes a "waitlisted" user when a confirmed attendee leaves
  //    (no event_waitlist table / promote RPC / leave→promote handler). The
  //    position over-fill "waitlist" badge that DOES exist is Priya's domain
  //    (persona-priya-positional). Un-fixme this once a real waitlist +
  //    promotion lands in packages/domain.
  //  - Live spot-count consistency across two viewers is the realtime path
  //    (Supabase Realtime) — deferred with the rest of the realtime suite.
  test.fixme('auto-promoted off the waitlist when a confirmed attendee leaves', async () => {});
  test.fixme('live spot count stays consistent across two viewers (realtime)', async () => {});
});
