import { expect, type Page } from '@playwright/test';
import { isVisibleOrTimeout } from './predicates';

/**
 * Shared recipe for a throwaway external community listing — the moderation
 * fixture the admin / persona-admin specs act on (hide / unhide / claim). An
 * inline equivalent predates this in `admin.authed.spec.ts`; this is the
 * canonical home so the persona-lens Zoe spec and the admin spec don't drift on
 * the form selectors. Mirrors `community/new/community-listing-form.tsx`:
 * `#title` / `#description` / `#externalUrl` / `#externalHostName`, the
 * React-controlled hidden `startsAt` (set via evaluate to skip the
 * DateTimePicker UI), and the "Submit listing" button that redirects to
 * `/community/<slug>`.
 */
export interface ThrowawayListing {
  /** The `/community/<slug>` detail URL. */
  url: string;
  title: string;
}

/**
 * Create an external community listing as the signed-in `page`. Returns `null`
 * when `/community/new` is gated for this account (redirect to /login or a
 * non-ok response) so the caller can skip gracefully. Caller owns cleanup —
 * pair with {@link deleteThrowawayListing}.
 */
export async function createThrowawayListing(
  page: Page,
  title: string,
): Promise<ThrowawayListing | null> {
  await page.goto('/community/new');
  await page.waitForLoadState('domcontentloaded');
  if (page.url().includes('/login') || !(await page.request.get('/community/new')).ok()) {
    return null;
  }

  await page.locator('#title').fill(title);
  await page.locator('#description').fill('E2E moderation fixture — safe to delete');
  await page.locator('#externalUrl').fill('https://www.facebook.com/groups/vbtest');
  await page.locator('#externalHostName').fill('E2E Test Club');

  // Set the React-controlled hidden startsAt directly (avoids the DateTimePicker
  // UI), then dispatch a change so the form state updates.
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await page.locator('input[name="startsAt"]').evaluate((el: HTMLInputElement, val: string) => {
    el.value = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, futureDate);

  await page.getByRole('button', { name: /submit listing/i }).click();
  await page.waitForURL(
    (url) => /\/community\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
    { timeout: 15_000 },
  );
  return { url: page.url(), title };
}

/**
 * Delete a throwaway listing through its owner-facing detail page (confirm
 * checkbox + "Delete"). Best-effort — swallows a missing button so teardown
 * never fails the test. Must be driven by the listing's owner (or an admin).
 */
export async function deleteThrowawayListing(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    const confirm = page.getByRole('checkbox', { name: /confirm/i }).first();
    if (await isVisibleOrTimeout(confirm, 2_000)) await confirm.check();
    const del = page.getByRole('button', { name: /^delete$/i }).first();
    if ((await del.count()) > 0) {
      await del.click();
      await page.waitForLoadState('domcontentloaded');
    }
  } catch {
    // Cleanup is best-effort; the periodic sweep reclaims `E2E ` listings.
  }
}

/**
 * Hide the listing currently open on `page` via the admin "Hide" affordance,
 * asserting the hidden confirmation. Caller must be a platform admin viewing
 * the listing detail page.
 */
export async function adminHideListing(page: Page): Promise<void> {
  const hide = page.getByRole('button', { name: /^hide$/i }).first();
  await expect(hide).toBeVisible({ timeout: 10_000 });
  await hide.click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('body')).toContainText(/hidden|only you|platform admin/i, {
    timeout: 10_000,
  });
}

/** Unhide the listing currently open on `page` via the admin "Unhide" button. */
export async function adminUnhideListing(page: Page): Promise<void> {
  const unhide = page.getByRole('button', { name: /^unhide$/i }).first();
  await expect(unhide).toBeVisible({ timeout: 10_000 });
  await unhide.click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('body')).toContainText(/restored|unhidden|active/i, {
    timeout: 10_000,
  });
}
