import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';

/**
 * Hannah Schmidt (P15) — the waitlister (capacity / auto-promote).
 * docs/personas.md.
 *
 * Hannah's journey is the capacity edge: RSVP to a full event → land on the
 * waitlist → get auto-promoted when a confirmed attendee leaves, with the live
 * spot count staying correct across viewers the whole time. That needs a
 * capacity-1 event plus contending attendees (Amy/Adam) in parallel contexts
 * and per-test teardown, so the mutating flow is fixme — modelled on the
 * "event is full" cross-context test in event-attendance.authed.spec.ts.
 */

const hannah = PERSONAS.hannah;

test.describe(`${hannah.name} (${hannah.id}) — waitlister`, () => {
  test('discovers events to RSVP to', async ({ browser }) => {
    await withPersona(browser, 'hannah', async (page) => {
      const res = await page.goto('/events');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  // The capacity/waitlist machinery (features.md § 2) needs a full event +
  // contending actors. Documented intent:
  test.fixme('RSVP to a full event lands on the waitlist', async () => {});
  test.fixme('auto-promoted off the waitlist when a confirmed attendee leaves', async () => {});
  test.fixme('live spot count stays consistent across two viewers (realtime)', async () => {});
});
