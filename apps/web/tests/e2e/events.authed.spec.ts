import { test, expect } from './_helpers/fixtures';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { cancelEvent, createFreeOpenPlayEvent } from './_helpers/event-create';

/**
 * Authenticated event flows.
 *
 * Mutations are cleaned up inline at the end of each test. If a test fails
 * mid-run, the orphaned data (cancelled event, RSVP) remains in the dev
 * environment but will not affect other tests.
 */

test.describe('event creation form', () => {
  test('/events/new loads with the expected fields', async ({ page }) => {
    const response = await page.goto('/events/new');
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/events\/new/);
    await expect(page.getByLabel(/title/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create event/i })).toBeVisible();
  });

  test('create a free open-play event end-to-end — DateTimePicker + geocoding, then cancel', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const title = `E2E Free Open Play ${Date.now()}`;
    let eventUrl: string | null = null;
    try {
      const created = await createFreeOpenPlayEvent(page, { title });
      eventUrl = created.url;

      // Detail page should render the event title we submitted.
      await page.goto(eventUrl);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      if (eventUrl) await cancelEvent(page, eventUrl);
    }
  });

  // Paid event create is covered by event-create-extended.authed.spec.ts:
  //   "create a paid event as stripe-host — price appears on detail page"
  // Multi-division tournament create remains a fixme there pending the
  // tournament harness bundle.
});

test.describe('saved event templates (Pro feature)', () => {
  // Pro tests run against the pro-host storage state via a secondary browser
  // context. The default attendee-a session does not have Pro; the
  // setup-pro-host project (driven by TEST_PRO_HOST_EMAIL) writes
  // .playwright/.auth/pro-host.json which we open here. Mirrors the pattern
  // in billing-stripe.authed.spec.ts.

  test('clicking Save template with an empty name shows inline error', async ({ browser }) => {
    skipIfMissingAuth(STORAGE_PATHS.proHost, 'pro-host');
    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.proHost });
    const page = await ctx.newPage();
    try {
      await page.goto('/events/new');

      // Pro user should see the template name input.
      const templateNameInput = page.getByPlaceholder(/template name/i);
      await expect(templateNameInput).toBeVisible({ timeout: 10_000 });

      // Click "Save template" without entering a name.
      const saveBtn = page.getByRole('button', { name: /save template/i });
      await expect(saveBtn).toBeVisible();
      await saveBtn.click();

      // Inline validation error should appear.
      await expect(page.locator('body')).toContainText(/enter a name|name required|name first/i);

      // The form should NOT have navigated away.
      await expect(page).toHaveURL(/\/events\/new/);
    } finally {
      await ctx.close().catch(() => {});
    }
  });

  test('non-Pro user sees no template card on /events/new', async ({ page }) => {
    await page.goto('/events/new');
    const templateNameInput = page.getByPlaceholder(/template name/i);
    const isProUser = (await templateNameInput.count()) > 0;
    if (isProUser) {
      test.skip(true, 'Test user has Pro — non-Pro check not applicable; skipping');
    }
    // Non-Pro: template controls should not be visible.
    await expect(templateNameInput).not.toBeVisible();
  });

  // Covered by event-create-extended.authed.spec.ts: "Pro: save template, verify in dropdown, apply pre-fills form, then remove"
});

test.describe('RSVP — join and leave a free event', () => {
  test('join and leave the first joinable free event', async ({ page }) => {
    await page.goto('/events');

    // Find the first event card link and navigate to it.
    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events in this environment; skipping RSVP test');
    }
    const href = (await eventLink.getAttribute('href')) ?? '/events';
    await page.goto(href);

    // Look for a "Join this event" button (free, open-play event).
    const joinBtn = page.getByRole('button', { name: /join this event/i }).first();
    if ((await joinBtn.count()) === 0) {
      test.skip(true, 'No joinable event found (paid, full, external, or already joined)');
    }

    // Join.
    await joinBtn.click();
    await page.waitForLoadState('domcontentloaded');

    // The "Leave event" button should now appear, confirming the join succeeded.
    await expect(page.getByRole('button', { name: /leave event/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Cleanup — leave the event.
    await page
      .getByRole('button', { name: /leave event/i })
      .first()
      .click();
    // Confirm if a confirmation dialog appears.
    const confirmLeave = page
      .getByRole('button', { name: /confirm|yes|leave/i })
      .filter({ hasNotText: /cancel/i })
      .first();
    if (await isVisibleOrTimeout(confirmLeave)) {
      await confirmLeave.click();
    }
    await page.waitForLoadState('domcontentloaded');

    // Back to join state.
    await expect(page.getByRole('button', { name: /join this event/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  // Paid RSVP via Stripe Checkout is covered by
  // event-attendance.authed.spec.ts:
  //   "RSVP to paid event → Stripe Checkout 4242 → redirected back with user on roster"

  // Event-full capacity check is covered by event-attendance.authed.spec.ts:
  //   "event full: attendee-b tries to join a capacity-1 event that attendee-a
  //    already filled — sees 'event is full'"
});

test.describe('event edit', () => {
  // "Host can edit event title" is covered by event-host.authed.spec.ts: "change title, save, verify new title on detail page"

  test('non-host is redirected away from /events/<id>/edit', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('domcontentloaded');

    const eventLinks = page.locator('a[href*="/events/"]');
    const count = await eventLinks.count();
    if (count === 0) {
      test.skip(true, 'No events in this environment; skipping non-host redirect test');
    }

    // Scan the first few events looking for one not owned by the test user.
    for (let i = 0; i < Math.min(count, 5); i++) {
      const href = await eventLinks.nth(i).getAttribute('href');
      if (!href || href.includes('/new')) continue;

      const editUrl = href.replace(/\/$/, '') + '/edit';
      await page.goto(editUrl);
      await page.waitForLoadState('domcontentloaded');

      const finalUrl = page.url();
      if (!finalUrl.includes('/edit')) {
        // Redirected — the guard is working.
        expect(finalUrl).not.toMatch(/\/events\/[^/]+\/edit/);
        return;
      }

      // We own this event; try the next one.
      await page.goto('/events');
      await page.waitForLoadState('domcontentloaded');
    }

    test.skip(
      true,
      'All sampled events are owned by the test user; cannot verify non-host redirect',
    );
  });
});

test.describe('host controls', () => {
  // "Cancel event" is covered by event-host.authed.spec.ts afterAll, which cancels the test event via edit page.
  // "Broadcast to attendees" is covered by event-host.authed.spec.ts:
  //   "broadcast to attendees: attendee-b RSVPs, host sends broadcast".
});
