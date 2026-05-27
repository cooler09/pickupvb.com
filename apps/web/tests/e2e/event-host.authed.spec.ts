import { test, expect } from '@playwright/test';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { cancelEvent, createFreeOpenPlayEvent } from './_helpers/event-create';

/**
 * Host-only event management flows.
 *
 * A beforeAll creates a single test event that all tests in this file share.
 * If creation fails, eventUrl is set to null and every test skips. The
 * afterAll cancels the test event via the edit page two-step confirm.
 *
 * If afterAll fails to clean up, cancel the event manually via
 * <eventUrl>/edit → "Cancel event…" → "Yes, cancel event".
 */

let eventUrl: string | null = null;
let testEventTitle: string;
let beforeAllError: string | null = null;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ storageState: STORAGE_PATHS.attendeeA });
  const page = await context.newPage();
  testEventTitle = `E2E Host Test ${Date.now()}`;

  try {
    const created = await createFreeOpenPlayEvent(page, { title: testEventTitle });
    eventUrl = created.url;
  } catch (err) {
    beforeAllError = err instanceof Error ? err.message : String(err);
    // Surface the failure so the next agent can see WHY creation failed
    // instead of every test silently skipping with the same message.
    // eslint-disable-next-line no-console
    console.error('[event-host beforeAll] event creation failed:', beforeAllError);
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser }) => {
  if (!eventUrl) return;
  const context = await browser.newContext({ storageState: STORAGE_PATHS.attendeeA });
  const page = await context.newPage();
  try {
    await cancelEvent(page, eventUrl);
  } finally {
    await context.close();
  }
});

test.describe('event host flows', () => {
  test('event detail page loads with the test title', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    const response = await page.goto(eventUrl!);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toContainText(testEventTitle, { timeout: 10_000 });
  });

  test('event edit page loads with title field pre-filled', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    const response = await page.goto(`${eventUrl}/edit`);
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/edit/, { timeout: 15_000 });
    const titleInput = page.locator('#title').first();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await expect(titleInput).toHaveValue(testEventTitle);
  });

  test('change title, save, verify new title on detail page', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    await page.goto(`${eventUrl}/edit`);

    // Wait for the form to be interactive (hydrated). Clicking Save
    // before the server-action endpoint is bound results in a no-op
    // native POST that re-renders the page with the OLD data and no
    // error banner.
    const titleInput = page.locator('#title');
    await expect(titleInput).toBeEditable({ timeout: 10_000 });

    const newTitle = `${testEventTitle} — edited`;
    await titleInput.fill(newTitle);
    await page.getByRole('button', { name: /save changes/i }).click();

    // The action ends with `redirect(\`/events/\${id}\`)` on success.
    // Waiting on the URL change proves the action ran (vs. networkidle,
    // which can resolve before the POST even fires). If the action
    // returns `{ error }` instead, the form Alert below catches it.
    const detailUrlRe = new RegExp(`${eventUrl!.replace(/[/]/g, '\\/')}(\\?|$)`);
    await page.waitForURL(detailUrlRe, { timeout: 15_000 });
    await expect(page.locator('main')).toContainText(newTitle, { timeout: 10_000 });

    // Restore original title for subsequent tests.
    await page.goto(`${eventUrl}/edit`);
    await expect(page.locator('#title')).toBeEditable({ timeout: 10_000 });
    await page.locator('#title').fill(testEventTitle);
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForURL(detailUrlRe, { timeout: 15_000 }).catch(() => {
      // Restoration is best-effort; the assertion above already passed.
    });
  });

  test('event detail shows host section', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    await page.goto(eventUrl!);
    // The host section should mention the host in some form.
    await expect(page.locator('main')).toContainText(/host|organizer|hosted by|by @/i);
  });

  test('analytics or attendance section is visible to host', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    await page.goto(eventUrl!);
    // Hosts see the roster/analytics panel on their own event. Target
    // the heading specifically — a plain text regex also matches the
    // hidden `<summary>` for "Message attendees" inside the collapsed
    // Host tools `<details>`, which `.first()` would resolve to in DOM
    // order even though it isn't visible.
    await expect(
      page.getByRole('heading', { name: /players signed up|attendance|attendees|rsvp|going/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('cancel event panel is present on edit page', async ({ page }) => {
    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    await page.goto(`${eventUrl}/edit`);
    const cancelEventBtn = page.getByRole('button', { name: /cancel event…/i }).first();
    await expect(cancelEventBtn).toBeVisible({ timeout: 10_000 });
  });

  test('sponsor panel — Pro host sees "Sponsor slot (Pro)" section on /edit', async ({
    browser,
  }) => {
    // Open a pro-host context (mirrors billing-stripe.authed pattern). The
    // attendee-a session this file's beforeAll uses isn't Pro, so we have to
    // create a separate disposable event as the pro-host and cancel it in
    // finally — we can't reuse `eventUrl` because that event is owned by
    // attendee-a, and only the host sees the edit page.
    skipIfMissingAuth(STORAGE_PATHS.proHost, 'pro-host');
    test.setTimeout(90_000);

    const ctx = await browser.newContext({ storageState: STORAGE_PATHS.proHost });
    const page = await ctx.newPage();
    let proEventUrl: string | null = null;
    try {
      const created = await createFreeOpenPlayEvent(page, {
        title: `E2E Pro Sponsor ${Date.now()}`,
      });
      proEventUrl = created.url;

      await page.goto(`${proEventUrl}/edit`);
      await page.waitForLoadState('domcontentloaded');

      // SponsorPanel renders `<h2>Sponsor slot (Pro)</h2>` (see
      // apps/web/src/app/events/[id]/edit/sponsor-panel.tsx).
      await expect(page.getByRole('heading', { name: /sponsor slot/i })).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      if (proEventUrl) await cancelEvent(page, proEventUrl);
      await ctx.close().catch(() => {});
    }
  });

  test('co-host section: add attendee-b, verify listed, remove', async ({ page, browser }) => {
    test.setTimeout(60_000);

    // In-band diagnostics: capture console errors + failed/server-action
    // responses so the next failure shows whether the POST even fired and
    // what status it returned. Server-action POSTs in Next 16 target the
    // page URL with a `Next-Action` header.
    const consoleErrors: string[] = [];
    const actionResponses: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on('requestfailed', (req) => {
      actionResponses.push(`FAIL ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
    });
    page.on('response', async (res) => {
      const req = res.request();
      if (req.method() === 'POST' && req.headers()['next-action']) {
        actionResponses.push(`${res.status()} ${req.url()} action=${req.headers()['next-action']}`);
      }
    });

    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');

    // Get attendee-b's display name for the UserPicker search.
    const bContext = await browser.newContext({ storageState: STORAGE_PATHS.attendeeB });
    const bPage = await bContext.newPage();
    let bDisplayName: string | null = null;
    let bHandle: string | null = null;
    try {
      await bPage.goto('/profile');
      await bPage.waitForLoadState('domcontentloaded');
      const dnInput = bPage.locator('input[name="display_name"]').first();
      bDisplayName = (await dnInput.count()) > 0 ? await dnInput.inputValue() : null;
      const hInput = bPage.locator('input[name="handle"]').first();
      bHandle = (await hInput.count()) > 0 ? await hInput.inputValue() : null;
    } finally {
      await bContext.close();
    }

    const searchTerm = bDisplayName || bHandle;
    if (!searchTerm) {
      test.skip(true, 'Could not determine attendee-b name; skipping');
    }

    await page.goto(eventUrl!);
    await page.waitForLoadState('domcontentloaded');

    // Open the "+ Add co-host" details panel.
    const addCoHostSummary = page
      .locator('details summary')
      .filter({ hasText: /add co-host/i })
      .first();
    if ((await addCoHostSummary.count()) === 0) {
      test.skip(true, '"+ Add co-host" panel not found on this event; skipping');
    }
    await addCoHostSummary.click();

    // The "+ Add co-host" panel contains two controls: a `<select name="group_id">`
    // (which has the implicit role=combobox) AND the UserPicker text input.
    // Scope to the user form via its stable hidden `<input name="kind"
    // value="user">` — that field is present in BOTH the unselected
    // (combobox + listbox) and selected (chip + Change) render branches.
    // Filtering by the combobox itself would lose the match after option
    // selection, since the UserPicker drops the combobox in chip mode.
    const userForm = page
      .locator('form')
      .filter({ has: page.locator('input[type="hidden"][name="kind"][value="user"]') })
      .first();
    const combobox = userForm.getByRole('combobox', { name: /add a player as co-host/i });
    await expect(combobox).toBeVisible({ timeout: 5_000 });
    await combobox.fill(searchTerm!);

    const listbox = userForm.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 10_000 });
    const option = listbox.getByRole('option').first();
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();

    // UserPicker swaps render branches when an option is picked: the
    // unselected branch has `<input hidden name="user_id" value="">`,
    // the selected branch has `<input hidden name="user_id" value={id}>`
    // and renders a "Change" button instead of the combobox. Without
    // waiting for the chip to render, the next click can submit FormData
    // with the empty hidden input → addCoHostFromForm silently no-ops
    // (no flash, no exception). Belt-and-suspenders: confirm the hidden
    // input actually carries an id.
    await expect(userForm.getByRole('button', { name: /^change$/i })).toBeVisible({
      timeout: 5_000,
    });
    await expect(userForm.locator('input[type="hidden"][name="user_id"]')).not.toHaveValue('', {
      timeout: 5_000,
    });

    // Submit "Add user" (scoped to the form so we don't grab a stray button).
    await userForm.getByRole('button', { name: /add user/i }).click();

    // Race the expected success signal (a new <li> in the hosts list
    // containing attendee-b) against the action's failure path (a
    // `?cohost=…` flash on the URL). `waitForLoadState('networkidle')`
    // is unreliable for server-action POSTs — the network can idle in
    // the gap between the submit and the redirect/revalidate.
    const hostsList = page.getByRole('list', { name: /hosts/i }).or(
      page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: /hosted by/i }) })
        .first()
        .locator('ul')
        .first(),
    );
    const cohostFlashUrl = new RegExp(`[?&]cohost=`);
    const outcome = await Promise.race([
      expect(hostsList)
        .toContainText(searchTerm!, { timeout: 15_000 })
        .then(() => 'added' as const),
      page.waitForURL(cohostFlashUrl, { timeout: 15_000 }).then(() => 'flashed' as const),
    ]).catch(() => 'timeout' as const);

    if (outcome !== 'added') {
      const url = page.url();
      const liTexts = await hostsList
        .locator('li')
        .allTextContents()
        .catch(() => [] as string[]);
      const hostsHtml = await hostsList
        .first()
        .evaluate((el) => el.outerHTML)
        .catch(() => '<no-match>');
      throw new Error(
        `Co-host did not appear (outcome=${outcome}, url=${url}); ` +
          `hosts <li> texts: ${JSON.stringify(liTexts)}; ` +
          `hosts UL: ${hostsHtml.slice(0, 1200)}; ` +
          `action responses: ${JSON.stringify(actionResponses)}; ` +
          `console errors: ${JSON.stringify(consoleErrors)}`,
      );
    }

    // Remove attendee-b as co-host.
    const removeBtn = page
      .getByRole('button', { name: new RegExp(`Remove co-host ${searchTerm}`, 'i') })
      .or(page.getByRole('button', { name: /remove co-host/i }).first())
      .first();
    await expect(removeBtn).toBeVisible({ timeout: 10_000 });
    await removeBtn.click();
    await page.waitForLoadState('domcontentloaded');

    // Attendee-b should no longer appear in the hosts list. Scope to the
    // <ul> (reusing `hostsList` from the add path) — the wrapping section
    // also contains the "+ Add co-host" UserPicker, which keeps the
    // last-selected user as a chip and would false-positive a section-
    // wide `not.toContainText` assertion.
    await expect(hostsList).not.toContainText(searchTerm!, { timeout: 10_000 });
    // Belt-and-suspenders: the remove button itself should be gone.
    await expect(
      page.getByRole('button', { name: new RegExp(`Remove co-host ${searchTerm}`, 'i') }),
    ).toHaveCount(0, { timeout: 10_000 });
  });

  test('broadcast to attendees: attendee-b RSVPs, host sends broadcast', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);

    if (!eventUrl) {
      test.skip(true, `Test event was not created (${beforeAllError ?? 'unknown'}); skipping`);
    }
    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');

    // Attendee-b RSVPs to the test event.
    const bContext = await browser.newContext({ storageState: STORAGE_PATHS.attendeeB });
    const bPage = await bContext.newPage();
    try {
      await bPage.goto(eventUrl!);
      await bPage.waitForLoadState('domcontentloaded');

      const joinBtn = bPage.getByRole('button', { name: /join this event/i }).first();
      if ((await joinBtn.count()) === 0) {
        test.skip(true, 'Attendee-b cannot join this event (full, paid, or already joined)');
      }
      await joinBtn.click();

      // Join is a two-step: the trigger opens a confirmation <dialog>.
      // Confirm inside the dialog (scoped so we don't re-click the trigger;
      // the page has two buttons named "Join this event" once the dialog
      // is open).
      const joinDialog = bPage.getByRole('dialog', { name: /join this event/i });
      if (await joinDialog.isVisible().catch(() => false)) {
        await joinDialog.getByRole('button', { name: /join this event/i }).click();
      }
      await bPage.waitForLoadState('domcontentloaded');
      await expect(bPage.getByRole('button', { name: /leave event/i }).first()).toBeVisible({
        timeout: 15_000,
      });

      // Host (attendee-a) navigates to event and sends a broadcast.
      await page.goto(eventUrl!);
      await page.waitForLoadState('domcontentloaded');

      // Open "Host tools" details.
      const hostToolsSummary = page
        .locator('details summary')
        .filter({ hasText: /host tools/i })
        .first();
      if ((await hostToolsSummary.count()) === 0) {
        test.skip(true, '"Host tools" section not found; skipping');
      }
      await hostToolsSummary.click();

      // Open "Message attendees" details.
      const messageSummary = page
        .locator('details summary')
        .filter({ hasText: /message attendees/i })
        .first();
      await expect(messageSummary).toBeVisible({ timeout: 10_000 });
      await messageSummary.click();

      // Capture server-action POST responses + console errors so the next
      // failure reports actual status codes, not just "didn't see
      // sent/delivered text". Same pattern as the co-host test above.
      const broadcastConsoleErrors: string[] = [];
      const broadcastActionResponses: string[] = [];
      const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
        if (msg.type() === 'error') broadcastConsoleErrors.push(msg.text().slice(0, 300));
      };
      const onResponse = (res: import('@playwright/test').Response) => {
        const req = res.request();
        if (req.method() === 'POST' && req.headers()['next-action']) {
          broadcastActionResponses.push(
            `${res.status()} ${req.url()} action=${req.headers()['next-action']}`,
          );
        }
      };
      page.on('console', onConsole);
      page.on('response', onResponse);

      // Fill the broadcast body and send.
      const bodyTextarea = page.locator('textarea[name="body"], #broadcast-body').first();
      await expect(bodyTextarea).toBeVisible({ timeout: 5_000 });
      await bodyTextarea.fill('E2E broadcast test message');

      const sendBtn = page.getByRole('button', { name: /send message/i }).first();
      await expect(sendBtn).toBeVisible({ timeout: 5_000 });

      // Wait for the server-action POST to settle with 2xx/3xx. This is
      // the actual outcome signal — `waitForLoadState('networkidle')` is
      // unreliable for server actions, and the visible "sent" copy /
      // textarea reset behavior isn't deterministic post-revalidate.
      const sendResponsePromise = page.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          !!res.request().headers()['next-action'] &&
          res.status() >= 200 &&
          res.status() < 400,
        { timeout: 15_000 },
      );
      await sendBtn.click();
      const sendOk = await sendResponsePromise.then(() => true).catch(() => false);
      page.off('console', onConsole);
      page.off('response', onResponse);

      if (!sendOk) {
        throw new Error(
          `Broadcast send did not produce a 2xx/3xx server-action response; ` +
            `url=${page.url()}; ` +
            `action responses: ${JSON.stringify(broadcastActionResponses)}; ` +
            `console errors: ${JSON.stringify(broadcastConsoleErrors)}`,
        );
      }
    } finally {
      // Cleanup: attendee-b leaves the event.
      await bPage.goto(eventUrl!);
      await bPage.waitForLoadState('domcontentloaded');
      const leaveBtn = bPage.getByRole('button', { name: /leave event/i }).first();
      if ((await leaveBtn.count()) > 0) {
        await leaveBtn.click();
        // Leave is also a two-step: scope the confirm click to the dialog
        // so we don't re-click the trigger button.
        const leaveDialog = bPage.getByRole('dialog', { name: /leave|confirm/i });
        if (await leaveDialog.isVisible().catch(() => false)) {
          const confirmInDialog = leaveDialog
            .getByRole('button', { name: /leave event|confirm|yes/i })
            .filter({ hasNotText: /cancel/i })
            .first();
          if (await isVisibleOrTimeout(confirmInDialog)) {
            await confirmInDialog.click();
          }
        }
        await bPage.waitForLoadState('domcontentloaded');
      }
      await bContext.close();
    }
  });
});
