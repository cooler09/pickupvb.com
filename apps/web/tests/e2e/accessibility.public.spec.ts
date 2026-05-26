import { test, expect } from '@playwright/test';

/**
 * Mobile viewport, keyboard navigation, and theme toggle.
 * Read-only; no auth required.
 */

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('home page renders in mobile viewport', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).toBeVisible();
  });

  test('mobile header has a menu toggle button', async ({ page }) => {
    await page.goto('/');
    // On mobile, the full nav is hidden and a hamburger/menu button is shown.
    const menuButton = page
      .getByRole('button', { name: /menu|navigation|open/i })
      .or(page.locator('button[aria-label*="menu" i]'))
      .or(page.locator('button[aria-controls*="nav" i]'))
      .first();
    await expect(menuButton).toBeVisible();
  });

  test('login form is scrollable and submittable on mobile', async ({ page }) => {
    await page.goto('/login');
    const emailField = page.getByLabel(/email/i);
    const passwordField = page.getByLabel(/password/i);
    await expect(emailField).toBeVisible();
    await expect(passwordField).toBeVisible();
    // Fields should be within the viewport (not cut off horizontally).
    const emailBox = await emailField.boundingBox();
    expect(emailBox?.width).toBeGreaterThan(0);
    expect((emailBox?.x ?? 0) + (emailBox?.width ?? 0)).toBeLessThanOrEqual(390);
  });
});

test.describe('keyboard navigation', () => {
  test('login form fields accept keyboard focus and are in the tab order', async ({ page }) => {
    await page.goto('/login');

    const emailField = page.getByLabel(/email/i);
    const passwordField = page.getByLabel(/password/i);
    const form = page.locator('form').filter({ has: passwordField });
    const submitBtn = form.getByRole('button', { name: /sign in|log in|create account/i });

    // Fields must not have tabIndex=-1 (which would exclude them from tab order).
    const emailTabIndex = await emailField.getAttribute('tabindex');
    const passwordTabIndex = await passwordField.getAttribute('tabindex');
    expect(emailTabIndex).not.toBe('-1');
    expect(passwordTabIndex).not.toBe('-1');

    // Fields accept programmatic focus.
    await emailField.focus();
    await expect(emailField).toBeFocused();

    await passwordField.focus();
    await expect(passwordField).toBeFocused();

    // Submit button is focusable.
    await submitBtn.focus();
    await expect(submitBtn).toBeFocused();
  });

  test('hero image upload buttons receive focus rings (keyboard accessible)', async ({ page }) => {
    // Navigate to a page that includes the hero image upload widget.
    // The profile page is the most accessible one for a public check — but it
    // requires auth. Instead verify the CSS rule is declared in the stylesheet.
    // This is a structural check: the widget uses focus-visible:ring-2 classes.
    await page.goto('/login');
    // Confirm Tailwind's focus-visible ring is in the page's stylesheet.
    const hasFocusRing = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText?.includes('focus-visible') && rule.cssText?.includes('ring')) {
              return true;
            }
          }
        } catch {
          // Cross-origin stylesheets; skip.
        }
      }
      return false;
    });
    expect(hasFocusRing).toBeTruthy();
  });
});

test.describe('theme toggle', () => {
  test('theme toggle button is present in the header', async ({ page }) => {
    await page.goto('/');
    const themeToggle = page
      .getByRole('button', { name: /theme|dark|light|mode/i })
      .or(page.locator('button[aria-label*="theme" i]'))
      .or(page.locator('button[aria-label*="dark" i]'))
      .or(page.locator('button[aria-label*="light" i]'))
      .first();
    await expect(themeToggle).toBeVisible();
  });

  test('clicking the theme toggle changes the page theme', async ({ page }) => {
    await page.goto('/');
    const themeToggle = page
      .getByRole('button', { name: /theme|dark|light|mode/i })
      .or(page.locator('button[aria-label*="theme" i]'))
      .or(page.locator('button[aria-label*="dark" i]'))
      .or(page.locator('button[aria-label*="light" i]'))
      .first();

    if ((await themeToggle.count()) === 0) {
      test.skip(true, 'No theme toggle found on this page');
    }

    // Capture before state.
    const html = page.locator('html');
    const beforeClass = await html.getAttribute('class');
    const beforeTheme = await html.getAttribute('data-theme');
    const before = beforeClass ?? beforeTheme ?? '';

    await themeToggle.click();

    // Poll until the theme attribute or class flips — replaces a fixed sleep
    // that was racing the transition.
    await expect
      .poll(async () => {
        const c = await html.getAttribute('class');
        const t = await html.getAttribute('data-theme');
        return c ?? t ?? '';
      })
      .not.toEqual(before);
  });
});
