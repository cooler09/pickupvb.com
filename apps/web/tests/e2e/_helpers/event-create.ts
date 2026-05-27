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
 * Opens the picker for `name`, picks the LAST visible non-disabled day in
 * the calendar grid (deep in the month → safely in the future even on early-
 * month runs and after `minDate` clamps), fills the time, and closes.
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

  // LAST non-disabled day in the visible month — pushes the date several
  // days ahead so server-side "starts in the past" validation can't reject.
  const day = dialog.locator('[role="gridcell"] button:not([disabled])').last();
  await day.click();

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
 * Cancel an event via its edit page two-step confirm. Best-effort: swallows
 * cleanup failures so a missing button doesn't break `afterAll`.
 */
export async function cancelEvent(page: Page, eventUrl: string): Promise<void> {
  try {
    await page.goto(`${eventUrl}/edit`);
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
