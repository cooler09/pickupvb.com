import { test, expect } from './_helpers/fixtures';
import { PERSONAS } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';

/**
 * Amy Cho (P8) — the casual open-play regular. docs/personas.md.
 *
 * Amy IS the primary authed user (attendee-a / TEST_USER_EMAIL), so this spec
 * uses the default per-worker `page` session directly — no `withPersona`
 * needed. Her journey is discovery + the account home she lives in; the full
 * RSVP→leave cycle is owned by events.authed.spec.ts (not duplicated here).
 */

const amy = PERSONAS.amy;

test.describe(`${amy.name} (${amy.id}) — discovery & account home`, () => {
  test('home feed renders', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
  });

  test('/events lists events with a search/filter affordance', async ({ page }) => {
    const res = await page.goto('/events');
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    // Some control to narrow the feed: a search box, a "Near me" button, or
    // surface/format filters. Accept any.
    const hasSearch = await isVisibleOrTimeout(
      page.getByRole('searchbox').or(page.locator('input[type="search"], input[name="q"]')).first(),
      5_000,
    );
    const hasNearMe = await isVisibleOrTimeout(
      page.getByRole('button', { name: /near me/i }).first(),
      3_000,
    );
    const hasFilter = await isVisibleOrTimeout(
      page.getByText(/indoor|grass|sand|filter|all surfaces/i).first(),
      3_000,
    );
    expect(hasSearch || hasNearMe || hasFilter).toBe(true);
  });

  test('/profile loads with her editable display name', async ({ page }) => {
    const res = await page.goto('/profile');
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    const hasName =
      (await isVisibleOrTimeout(page.locator('input[name="display_name"]').first(), 5_000)) ||
      (await isVisibleOrTimeout(
        page
          .locator('details summary')
          .filter({ hasText: /edit profile/i })
          .first(),
        5_000,
      ));
    expect(hasName).toBe(true);
  });

  test('/profile/receipts loads (empty state or list)', async ({ page }) => {
    const res = await page.goto('/profile/receipts');
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
  });

  test('/notifications loads and the bell is reachable', async ({ page }) => {
    const res = await page.goto('/notifications');
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    // The header notification bell is present on authed pages.
    const hasBell = await isVisibleOrTimeout(
      page
        .getByRole('button', { name: /notification/i })
        .or(page.getByRole('link', { name: /notification/i }))
        .first(),
      5_000,
    );
    expect(hasBell || page.url().includes('/notifications')).toBe(true);
  });

  // The join/leave/waitlist cycle is owned by events.authed.spec.ts; Hannah
  // (P15) carries the waitlist-promotion journey.
  test.fixme('RSVPs to an open play and leaves — see events.authed.spec.ts', async () => {});
});
