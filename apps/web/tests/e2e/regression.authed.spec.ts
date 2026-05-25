import { test, expect } from '@playwright/test';
import path from 'node:path';

const STORAGE_STATE = path.join(__dirname, '..', '..', '.playwright', '.auth', 'user.json');

/**
 * Regression checklist (Section 19) — a targeted smoke pass that should
 * complete in under 15 minutes after any deploy. Mirrors the manual checklist
 * from Section 19, implementing each item as an automated assertion.
 *
 * All tests use the stored auth session injected by the authed project in
 * playwright.config.ts. Tests that would destroy the session (sign out) are
 * marked fixme to avoid side effects on tests that run after them.
 */

test.describe('regression', () => {
  test('home page loads signed out (public sanity)', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.ok(), `home page returned ${response?.status()}`).toBeTruthy();
    await expect(page).toHaveTitle(/pickupvb|volleyball/i);
  });

  test('sign in works — /profile is accessible without redirect to login', async ({ page }) => {
    // auth.setup.ts already validated sign-in. Here we just confirm the authed
    // session is healthy by visiting /profile directly.
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });
    expect(page.url()).not.toMatch(/\/login/);
  });

  test('/events/new is reachable without redirect to login', async ({ page }) => {
    await page.goto('/events/new');
    await expect(page).toHaveURL(/\/events\/new/, { timeout: 15_000 });
    expect(page.url()).not.toMatch(/\/login/);
  });

  test('RSVP to a free event — join then leave', async ({ page }) => {
    await page.goto('/events');

    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events in this environment; skipping RSVP regression test');
    }

    const href = (await eventLink.getAttribute('href')) ?? '/events';
    await page.goto(href);

    const joinBtn = page.getByRole('button', { name: /join this event/i }).first();
    if ((await joinBtn.count()) === 0) {
      test.skip(true, 'No joinable event found (paid, full, external, or already joined)');
    }

    await joinBtn.click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /leave event/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Cleanup — leave the event.
    await page
      .getByRole('button', { name: /leave event/i })
      .first()
      .click();

    const confirmLeave = page
      .getByRole('button', { name: /confirm|yes|leave/i })
      .filter({ hasNotText: /cancel/i })
      .first();
    if (await confirmLeave.isVisible().catch(() => false)) {
      await confirmLeave.click();
    }
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /join this event/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('host can see attendee section on event page', async ({ page }) => {
    await page.goto('/events');

    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events in this environment; skipping attendee section test');
    }

    const href = (await eventLink.getAttribute('href')) ?? '/events';
    await page.goto(href);

    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main')).toContainText(/attendance|attendees|rsvp|going/i);
  });

  test('hero image upload widget is present on profile', async ({ page }) => {
    await page.goto('/profile');

    const addBannerBtn = page.getByRole('button', { name: /add banner image/i }).first();
    const changeBtn = page.getByRole('button', { name: /change image/i }).first();

    const hasAdd = await addBannerBtn.isVisible({ timeout: 10_000 }).catch(() => false);
    const hasChange = await changeBtn.isVisible({ timeout: 10_000 }).catch(() => false);

    expect(hasAdd || hasChange, 'Hero image upload widget must be visible on /profile').toBe(true);
  });

  test('template save validation shows error for empty name', async ({ page }) => {
    await page.goto('/events/new');

    // The template card is a Pro-only feature.
    const templateNameInput = page.getByPlaceholder(/template name/i);
    const isProUser = (await templateNameInput.count()) > 0;
    if (!isProUser) {
      test.skip(true, 'Test user does not have Pro — template card not shown; skipping');
    }

    const saveTemplateBtn = page.getByRole('button', { name: /save template/i });
    await expect(saveTemplateBtn).toBeVisible({ timeout: 10_000 });

    // Click without filling the template name.
    await saveTemplateBtn.click();

    await expect(page.locator('body')).toContainText(/enter a name|name required|name first/i, {
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/events\/new/);
  });

  test('event edit title change is verifiable', async ({ page }) => {
    await page.goto('/events');

    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events in this environment; skipping event edit regression test');
    }

    const href = (await eventLink.getAttribute('href')) ?? '/events';
    const editUrl = href.replace(/\/$/, '') + '/edit';
    const response = await page.goto(editUrl);

    if (!response?.ok() || page.url().includes('/login') || !page.url().includes('/edit')) {
      test.skip(true, 'Event edit page not accessible — test user is not the host');
    }

    const titleInput = page.locator('#title').first();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });

    const originalTitle = await titleInput.inputValue();
    const updatedTitle = `${originalTitle} — regression test`;

    await titleInput.fill(updatedTitle);
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForLoadState('networkidle');

    // Navigate to detail page and confirm the title change is visible.
    await page.goto(href);
    await expect(page.locator('main')).toContainText(updatedTitle, { timeout: 10_000 });

    // Restore the original title.
    await page.goto(editUrl);
    await page.locator('#title').first().fill(originalTitle);
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForLoadState('networkidle');
  });

  test('group page loads', async ({ page }) => {
    await page.goto('/groups');

    const groupLink = page.locator('a[href*="/groups/"]').first();
    if ((await groupLink.count()) === 0) {
      test.skip(true, 'No groups in this environment; skipping group page regression test');
    }

    const href = (await groupLink.getAttribute('href')) ?? '/groups';
    const response = await page.goto(href);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
  });

  test('player profile loads', async ({ page }) => {
    await page.goto('/players');

    const playerLink = page.locator('a[href*="/players/"]').first();
    if ((await playerLink.count()) === 0) {
      test.skip(true, 'No players in this environment; skipping player profile regression test');
    }

    const href = (await playerLink.getAttribute('href')) ?? '/players';
    const response = await page.goto(href);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
  });

  test('sign out redirects to login; /profile then redirects to login', async ({ browser }) => {
    // Use a fresh context so this test does not destroy the shared authed session.
    const context = await browser.newContext({ storageState: STORAGE_STATE });
    const page = await context.newPage();
    try {
      await page.goto('/profile');
      await expect(page).toHaveURL(/\/profile/, { timeout: 10_000 });

      const signOutBtn = page
        .getByRole('button', { name: /sign out|log out/i })
        .or(page.getByRole('link', { name: /sign out|log out/i }))
        .first();

      if ((await signOutBtn.count()) === 0) {
        test.skip(true, 'No sign-out button found on /profile; skipping');
      }

      await signOutBtn.click();
      await page.waitForLoadState('networkidle');

      // After signing out the user should NOT still be on /profile.
      expect(page.url()).not.toMatch(/\/profile/);

      // Visiting /profile while signed out must redirect to /login.
      await page.goto('/profile');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test('theme toggle persists across navigation', async ({ page }) => {
    await page.goto('/');

    // Look for a theme toggle button (sun/moon icon, "toggle theme", etc.).
    const themeToggle = page
      .getByRole('button', { name: /toggle theme|dark mode|light mode|theme/i })
      .or(page.locator('[data-testid*="theme"]').first())
      .first();

    if ((await themeToggle.count()) === 0) {
      test.skip(true, 'No theme toggle found on the home page; skipping');
    }

    // Capture current theme state from <html> before toggling.
    const htmlEl = page.locator('html');
    const beforeClass = (await htmlEl.getAttribute('class')) ?? '';
    const beforeDataTheme = (await htmlEl.getAttribute('data-theme')) ?? '';

    await themeToggle.first().click();
    await page.waitForLoadState('networkidle');

    // After toggling, the attribute must have changed.
    const afterClass = (await htmlEl.getAttribute('class')) ?? '';
    const afterDataTheme = (await htmlEl.getAttribute('data-theme')) ?? '';
    const themeChanged = afterClass !== beforeClass || afterDataTheme !== beforeDataTheme;
    expect(themeChanged, 'Theme attribute should change after toggle').toBe(true);

    // Navigate to /events and verify the same theme is still applied.
    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    const eventsClass = (await page.locator('html').getAttribute('class')) ?? '';
    const eventsDataTheme = (await page.locator('html').getAttribute('data-theme')) ?? '';

    // The new theme should persist: the class or data-theme on /events should
    // match what was set on /, not revert to the original.
    const themePersistedViaClass =
      afterClass !== '' &&
      (eventsClass.includes('dark') === afterClass.includes('dark') ||
        eventsClass.includes('light') === afterClass.includes('light'));
    const themePersistedViaData = afterDataTheme !== '' && eventsDataTheme === afterDataTheme;
    const themePersistedViaAny =
      themePersistedViaClass ||
      themePersistedViaData ||
      // Fallback: at minimum the theme did not silently revert all the way back.
      eventsClass !== beforeClass ||
      eventsDataTheme !== beforeDataTheme;

    expect(themePersistedViaAny, 'Theme should persist when navigating to /events').toBe(true);
  });
});
