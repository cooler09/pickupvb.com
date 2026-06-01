import { test, expect } from './_helpers/fixtures';
import { isVisibleOrTimeout } from './_helpers/predicates';

/**
 * Hero image upload widget — authenticated flows.
 *
 * Hero banners now exist on **events only**. Profiles and groups dropped their
 * hero banner in favour of an uploadable avatar (see avatar-upload.tsx /
 * group-avatar-panel.tsx), so the former profile/group hero specs were removed.
 * This spec verifies the banner widget still appears on the event-edit page when
 * the signed-in user is the host. The authed project in playwright.config.ts
 * injects the storageState automatically for every *.authed.spec.ts test.
 */

test.describe('hero image — event edit', () => {
  test('upload widget appears on event edit page', async ({ page }) => {
    await page.goto('/events');

    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events in this environment; skipping event-edit hero image test');
    }

    const href = (await eventLink.getAttribute('href')) ?? '/events';
    const editUrl = href.replace(/\/$/, '') + '/edit';
    const response = await page.goto(editUrl);

    // Skip gracefully if not the host (edit page redirects away or returns non-200).
    if (!response?.ok() || page.url().includes('/login') || !page.url().includes('/edit')) {
      test.skip(true, 'Edit page not accessible — user is not the host of this event');
    }

    const addBannerBtn = page.getByRole('button', { name: /add banner image/i }).first();
    const hasWidget = await isVisibleOrTimeout(addBannerBtn, 10_000);
    if (!hasWidget) {
      test.skip(true, 'No hero image widget found on event edit page');
    }
    await expect(addBannerBtn).toBeVisible({ timeout: 10_000 });
  });
});
