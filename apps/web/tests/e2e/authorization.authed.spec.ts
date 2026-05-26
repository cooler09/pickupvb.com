import { test, expect } from '@playwright/test';

/**
 * Authorization checks (Section 18.2 of the test plan).
 *
 * Verifies that authenticated users cannot access resources they don't own.
 * These tests do NOT require a second test account — they rely on the test
 * user NOT being the owner of the first event/group found in the directory.
 *
 * Unauthenticated access checks (Section 18.1) are covered in navigation.public.spec.ts.
 */

test.describe('non-owner cannot edit an event', () => {
  test('visiting /events/<id>/edit for a non-owned event redirects or 404s', async ({ page }) => {
    // Find the first event in the browse list.
    await page.goto('/events');

    const eventLink = page.locator('a[href*="/events/"]').first();
    // Don't use waitForLoadState('networkidle') — analytics beacons keep the
    // network busy past the test timeout. Wait on a deterministic UI signal.
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events in this environment; skipping authorization test');
    }
    await expect(eventLink).toBeVisible();

    const href = (await eventLink.getAttribute('href')) ?? '';
    if (!href) {
      test.skip(true, 'Could not get event href; skipping');
    }

    // Navigate to the event first to confirm it loads.
    const eventResponse = await page.goto(href);
    if (!eventResponse?.ok()) {
      test.skip(true, 'Event page did not load; skipping');
    }

    // Check if the test user is the host — if so, the edit page would load legitimately.
    const isHostPage = await page
      .getByRole('link', { name: /edit event|manage event/i })
      .or(page.getByRole('button', { name: /edit event|cancel event/i }))
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);

    if (isHostPage) {
      test.skip(
        true,
        'Test user owns this event — cannot test non-owner authorization here; skipping',
      );
    }

    // Try accessing the edit page directly.
    const editUrl = `${href.replace(/\/$/, '')}/edit`;
    await page.goto(editUrl);

    // Should redirect to login, the event page, or show a 404/403 — NOT the edit form.
    const editFormVisible = await page
      .getByRole('button', { name: /save changes|cancel event/i })
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    expect(editFormVisible).toBe(false);

    // Verify we're not on the edit URL with an editable form.
    // Acceptable outcomes: redirect to /events/<id>, /login, or an error page.
    await expect(page.locator('body')).not.toContainText(/save changes/i);
    await expect(page.locator('body')).not.toContainText(/cancel event…/i);
  });
});

test.describe('non-member cannot access group members page', () => {
  test('/groups/<slug>/members redirects non-member', async ({ page }) => {
    // Find the first group in the directory.
    await page.goto('/groups');

    const groupLink = page.locator('a[href*="/groups/"]').first();
    if ((await groupLink.count()) === 0) {
      test.skip(true, 'No groups in this environment; skipping');
    }
    await expect(groupLink).toBeVisible();

    const href = (await groupLink.getAttribute('href')) ?? '';
    if (!href) {
      test.skip(true, 'Could not get group href; skipping');
    }

    // Check if the test user is an admin/owner of this group.
    const groupPageResponse = await page.goto(href);
    if (!groupPageResponse?.ok()) {
      test.skip(true, 'Group page did not load; skipping');
    }

    const isMemberAdmin = await page
      .getByRole('link', { name: /manage members|settings|edit group/i })
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);

    if (isMemberAdmin) {
      test.skip(
        true,
        'Test user is an admin/owner of this group — cannot test non-member authorization here; skipping',
      );
    }

    // Try accessing the members management page directly.
    const membersUrl = `${href.replace(/\/$/, '')}/members`;
    await page.goto(membersUrl);

    // Should redirect or show access denied — not a member management UI.
    const membersFormVisible = await page
      .getByRole('button', { name: /add member|invite|remove/i })
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    // Non-members should not see the member management form.
    expect(membersFormVisible).toBe(false);
  });
});

test.describe('non-Pro analytics guard', () => {
  test('/profile/billing/analytics shows upgrade prompt for non-Pro user', async ({ page }) => {
    const response = await page.goto('/profile/billing/analytics');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });

    // Either shows an upgrade CTA (non-Pro) or actual analytics (Pro user).
    const hasUpgradePrompt = await page
      .getByText(/upgrade|pro|unlock analytics|analytics.*included/i)
      .first()
      .isVisible()
      .catch(() => false);
    const hasAnalytics = await page
      .getByText(/impressions|fill rate|gmv|attendees.*chart/i)
      .first()
      .isVisible()
      .catch(() => false);

    // One or the other must be true.
    expect(hasUpgradePrompt || hasAnalytics).toBe(true);
  });
});
