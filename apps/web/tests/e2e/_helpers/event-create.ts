import { expect, type Page } from '@playwright/test';
import { isVisibleOrTimeout } from './predicates';

/**
 * Shared helpers for tests that need to create a real event on the target
 * environment. Extracted from event-host.authed.spec.ts so other specs
 * (free-event create-flow tests, sponsor panel, host-as-group, etc.) can
 * reuse the exact same recipe — see `tests/e2e/README.md` and
 * `/memories/repo/e2e-tests.md` for the gotchas this encodes (DateTimePicker
 * trigger selector, the address-disclosure collapse, the `?created=1`
 * redirect quirk, and the server-side geocoder requiring a real US address).
 *
 * Cleanup is via the edit page two-step cancel — see `cancelEvent`.
 */

/**
 * The DateTimePicker exposes the visible trigger as `<button id={name}>` and
 * the hidden form value as `<input type="hidden" name={name}>`. So `#startsAt`
 * targets the trigger and `input[type=hidden][name="startsAt"]` carries the
 * ISO string the server reads.
 *
 * Opens the picker for `name`, advances the calendar to the NEXT month, and
 * clicks a fixed in-month day (start → the 10th, end → the 20th). Two reasons
 * this beats "click the last non-disabled day in the visible month":
 *
 *  - **Next month is unambiguously in the future**, so `minDate={new Date()}`
 *    never disables the target and there's no month-boundary flakiness on
 *    early- vs. late-month runs.
 *  - **Start and end land on different days (10th < 20th).** The form
 *    auto-fills `endsAt = startsAt + 2h` the moment a start is picked
 *    (`handleStartsAtChange`), so by the time we open the end picker it already
 *    has a selection. react-day-picker renders in single mode, where clicking
 *    the *already-selected* day toggles it back off — which is exactly what the
 *    old "last non-disabled day" logic did (the only enabled cell in the
 *    displayed month collided with the auto-filled day), leaving `endsAt`
 *    empty. Picking a distinct, clearly-later day sidesteps the toggle.
 */
export async function pickFutureDateTime(
  page: Page,
  name: 'startsAt' | 'endsAt',
  timeHhmm: string,
): Promise<void> {
  const trigger = page.locator(`button#${name}`);
  await trigger.click();

  const dialog = page.locator('[role="dialog"]').last();
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });

  // Advance to next month (aria-label defaults to "Go to the Next Month").
  await dialog.getByRole('button', { name: /next month/i }).click();

  // Distinct days so the end never lands on the start's auto-filled selection.
  const targetDay = name === 'startsAt' ? '10' : '20';
  await dialog
    .locator('[role="gridcell"] button:not([disabled])')
    .filter({ hasText: new RegExp(`^${targetDay}$`) })
    .first()
    .click();

  const timeInput = dialog.locator('input[type="time"]').first();
  await timeInput.fill(timeHhmm);

  // Trigger handleTime → onChange → hidden input updates.
  await timeInput.blur();
  await page.keyboard.press('Escape');

  // Verify the hidden ISO input now has a value.
  const hiddenIso = await page
    .locator(`input[type="hidden"][name="${name}"]`)
    .inputValue()
    .catch(() => '');
  if (!hiddenIso) throw new Error(`DateTimePicker for ${name} did not populate hidden input`);
}

export interface CreateFreeOpenPlayEventOptions {
  title: string;
  /** Optional group id to set as `hostGroupId` (Host as <group>). */
  hostGroupId?: string;
  startTime?: string;
  endTime?: string;
  /**
   * When set, switch the capacity selector to "Fixed spots" and cap the event
   * at this many attendees (the `#maxSpots` field). Used by the capacity /
   * waitlist personas to provision a small, fillable event. Applied BEFORE the
   * DateTimePicker is driven, because toggling the capacity SegmentedControl
   * re-renders and would reset the React-controlled hidden `startsAt` input.
   */
  maxSpots?: number;
  /**
   * The "Sign me up as a player too" checkbox defaults to CHECKED, so the host
   * is auto-added as the first attendee. Pass `false` to leave the roster empty
   * — essential for capacity tests where a *different* account must take the
   * only spot (otherwise the host silently fills it at create time).
   */
  joinAsHost?: boolean;
}

export interface CreatedEvent {
  /** Detail URL with the `?created=1` flash query stripped. */
  url: string;
  id: string;
}

/**
 * Drive `/events/new` end-to-end for a free open-play event using the
 * convention-center fixture address that geocodes reliably. Returns the
 * detail URL + uuid on success, throws with the visible form errors on
 * failure so the caller can surface them.
 *
 * Caller is responsible for cleanup — see `cancelEvent`.
 */
export async function createFreeOpenPlayEvent(
  page: Page,
  opts: CreateFreeOpenPlayEventOptions,
): Promise<CreatedEvent> {
  const start = opts.startTime ?? '18:00';
  const end = opts.endTime ?? '20:00';

  await page.goto('/events/new');
  if (page.url().includes('/login') || page.url().includes('/upgrade')) {
    throw new Error(
      `redirected to ${new URL(page.url()).pathname} — event creation gated for this account`,
    );
  }

  await page.locator('#title').fill(opts.title);

  // Capacity must be set BEFORE the dates: the "Fixed spots" SegmentedControl
  // (a `<button role="radio">`) re-renders OpenPlayBody on click, which resets
  // the React-controlled hidden `startsAt`/`endsAt` inputs. Drive it first.
  if (opts.maxSpots !== undefined) {
    await page.getByRole('radio', { name: /fixed spots/i }).click();
    const maxSpots = page.locator('#maxSpots');
    await expect(maxSpots, '#maxSpots input').toBeVisible({ timeout: 5_000 });
    await maxSpots.fill(String(opts.maxSpots));
  }

  // The "Sign me up as a player too" checkbox is a plain (uncontrolled,
  // defaultChecked) input, so unchecking it doesn't re-render or reset the
  // dates — still, do it before the pickers to keep all roster mutations ahead
  // of the date inputs.
  if (opts.joinAsHost === false) {
    const joinAsHost = page.locator('input[name="joinAsHost"]');
    if (await joinAsHost.isChecked()) await joinAsHost.uncheck();
  }

  await pickFutureDateTime(page, 'startsAt', start);
  await pickFutureDateTime(page, 'endsAt', end);

  await page.locator('#addressLine').fill('1000 19th St');
  // City/region/postal/country are visible only while no address detail has
  // been entered yet (hasAddress=false). Fill them BEFORE the conditional
  // collapses; if addressLine already triggered the collapse, click the
  // "Edit address details" button to reopen.
  const editDetailsBtn = page.getByRole('button', { name: /edit address details/i });
  if (await isVisibleOrTimeout(editDetailsBtn, 1_000)) {
    await editDetailsBtn.click();
  }
  await page.locator('#city').fill('Virginia Beach');
  await page.locator('#region').fill('VA');
  await page.locator('#postalCode').fill('23451');
  await page.locator('#country').fill('US');

  if (opts.hostGroupId) {
    await page.locator('#hostGroupId').selectOption(opts.hostGroupId);
  }

  await page.getByRole('button', { name: /create event/i }).click();

  await page.waitForURL(/\/events\/[0-9a-f-]{36}(\?|$)/, { timeout: 20_000 }).catch(async () => {
    const currentUrl = page.url();
    const errors = await page
      .locator('[role="alert"], .text-error, [class*="error"]')
      .allTextContents()
      .catch(() => [] as string[]);
    throw new Error(
      `submit did not redirect (stayed on ${currentUrl}); visible errors: ${JSON.stringify(errors.slice(0, 5))}`,
    );
  });

  const url = page.url().replace(/\?.*$/, '');
  const match = /\/events\/([0-9a-f-]{36})/.exec(url);
  if (!match) throw new Error(`could not extract event id from ${url}`);
  return { url, id: match[1]! };
}

/**
 * Cancel an event via the host manage dashboard's two-step confirm. The
 * cancel / danger-zone panel moved from `/edit` to `/events/[id]/manage`
 * ("Danger zone" group), so cleanup drives it there. Best-effort: swallows
 * cleanup failures so a missing button doesn't break `afterAll`.
 */
export async function cancelEvent(page: Page, eventUrl: string): Promise<void> {
  try {
    await page.goto(`${eventUrl}/manage`);
    await page.waitForLoadState('domcontentloaded');

    const cancelBtn = page.getByRole('button', { name: /cancel event…/i }).first();
    if ((await cancelBtn.count()) === 0) return;
    await cancelBtn.click();
    const confirmBtn = page.getByRole('button', { name: /yes, cancel event/i }).first();
    if ((await confirmBtn.count()) === 0) return;
    await confirmBtn.click();
    await page.waitForLoadState('domcontentloaded');
  } catch {
    // Cleanup failed — caller will need to delete manually.
  }
}

/**
 * The saved-templates affordance on `/events/new` is Pro-only and now lives
 * behind a "Templates" button that opens a `FormModal`
 * (see `_components/templates-section.tsx`). Non-Pro hosts instead see a
 * "Save & reuse event setups with Pro" upsell link — no trigger.
 *
 * Clicks the trigger (if present) and waits for the modal body. Returns `true`
 * when the Pro affordance was present and the modal opened, `false` otherwise —
 * so callers can detect Pro vs. free without relying on the inner input being
 * in the DOM up-front (Radix only portals the modal body once open).
 */
export async function openTemplatesModal(page: Page): Promise<boolean> {
  const trigger = page.getByRole('button', { name: /^templates$/i });
  if (!(await isVisibleOrTimeout(trigger, 10_000))) return false;
  await trigger.click();
  await expect(page.getByPlaceholder(/template name/i)).toBeVisible({ timeout: 10_000 });
  return true;
}

/** Convenience: assert the new-event page is reachable for this storage state. */
export async function expectNewEventReachable(page: Page): Promise<void> {
  await page.goto('/events/new');
  expect(page.url()).toMatch(/\/events\/new/);
  await expect(page.getByRole('button', { name: /create event/i })).toBeVisible({
    timeout: 10_000,
  });
}

export interface CreatePaidEventOptions extends CreateFreeOpenPlayEventOptions {
  /** Ticket price in USD. The form field is `priceUsd`. */
  priceUsd: number;
  /** Refund window in hours. Defaults to 24 (form default). */
  refundWindowHours?: number;
}

/**
 * Create a paid open-play event. The caller MUST be signed in as a host
 * with Stripe Connect onboarded (i.e. `STORAGE_PATHS.stripeHost`). If the
 * host isn't Stripe-ready, the form rejects with a "host_not_ready"-style
 * error and this helper surfaces it.
 *
 * Caller is responsible for cleanup via `cancelEvent`.
 */
export async function createPaidEvent(
  page: Page,
  opts: CreatePaidEventOptions,
): Promise<CreatedEvent> {
  const start = opts.startTime ?? '18:00';
  const end = opts.endTime ?? '20:00';

  await page.goto('/events/new');
  if (page.url().includes('/login') || page.url().includes('/upgrade')) {
    throw new Error(
      `redirected to ${new URL(page.url()).pathname} — paid event creation gated for this account`,
    );
  }

  await page.locator('#title').fill(opts.title);
  await pickFutureDateTime(page, 'startsAt', start);
  await pickFutureDateTime(page, 'endsAt', end);

  await page.locator('#addressLine').fill('1000 19th St');
  const editDetailsBtn = page.getByRole('button', { name: /edit address details/i });
  if (await isVisibleOrTimeout(editDetailsBtn, 1_000)) {
    await editDetailsBtn.click();
  }
  await page.locator('#city').fill('Virginia Beach');
  await page.locator('#region').fill('VA');
  await page.locator('#postalCode').fill('23451');
  await page.locator('#country').fill('US');

  if (opts.hostGroupId) {
    await page.locator('#hostGroupId').selectOption(opts.hostGroupId);
  }

  // Set price. The form input name is `priceUsd` (see new-event-form.tsx).
  const priceInput = page.locator('input[name="priceUsd"]').first();
  await expect(priceInput, 'priceUsd input').toBeVisible({ timeout: 10_000 });
  await priceInput.fill(String(opts.priceUsd));

  if (opts.refundWindowHours !== undefined) {
    const refundInput = page.locator('input[name="refundWindowHours"]').first();
    if (await isVisibleOrTimeout(refundInput, 1_000)) {
      // Fail fast if the field is disabled (e.g. host lost Pro on the
      // environment). Otherwise `.fill()` waits silently for editability
      // and consumes the entire test-level timeout.
      if (await refundInput.isDisabled()) {
        throw new Error(
          'refundWindowHours input is disabled — host account is not Pro on this environment',
        );
      }
      await refundInput.fill(String(opts.refundWindowHours));
    }
  }

  await page.getByRole('button', { name: /create event/i }).click();

  await page.waitForURL(/\/events\/[0-9a-f-]{36}(\?|$)/, { timeout: 20_000 }).catch(async () => {
    const currentUrl = page.url();
    const errors = await page
      .locator('[role="alert"], .text-error, [class*="error"]')
      .allTextContents()
      .catch(() => [] as string[]);
    throw new Error(
      `paid event submit did not redirect (stayed on ${currentUrl}); visible errors: ${JSON.stringify(errors.slice(0, 5))}`,
    );
  });

  const url = page.url().replace(/\?.*$/, '');
  const match = /\/events\/([0-9a-f-]{36})/.exec(url);
  if (!match) throw new Error(`could not extract event id from ${url}`);
  return { url, id: match[1]! };
}
