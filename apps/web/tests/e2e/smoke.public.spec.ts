import { test, expect } from '@playwright/test';

/**
 * Public smoke tests — no auth required. Hits the top entry points a search
 * crawler or first-time visitor would. Failure here means the site is broken
 * for everyone.
 */

test.describe('public smoke', () => {
  test('home page renders without errors and has SEO basics', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await page.goto('/');
    expect(response?.ok(), `home returned ${response?.status()}`).toBeTruthy();

    // Title is set and non-default.
    await expect(page).toHaveTitle(/pickupvb|volleyball/i);

    // Primary nav link to events exists.
    await expect(page.getByRole('link', { name: /events/i }).first()).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('events browse page lists or empty-states', async ({ page }) => {
    const response = await page.goto('/events');
    expect(response?.ok()).toBeTruthy();

    await expect(page).toHaveTitle(/volleyball events/i);

    // Either some events render OR an empty/sign-in CTA renders. Anything but
    // a blank page is acceptable here.
    const main = page.locator('main');
    await expect(main).toBeVisible();
    const text = (await main.textContent()) ?? '';
    expect(text.trim().length, 'main content should not be empty').toBeGreaterThan(50);
  });

  test('events filter form updates the URL', async ({ page }) => {
    await page.goto('/events');
    // The browse page has surface / type checkboxes that submit via GET.
    // We just toggle the first surface filter and confirm the URL reflects it.
    const surfaceCheckbox = page
      .locator('input[type="checkbox"][name="surface"], input[type="checkbox"][name="surfaces"]')
      .first();
    if ((await surfaceCheckbox.count()) === 0) test.skip(true, 'no surface filter on this page');
    await surfaceCheckbox.check();
    // Filter form submits on change OR has a visible Apply button. Try both.
    const apply = page.getByRole('button', { name: /apply|filter|update/i }).first();
    if (await apply.isVisible().catch(() => false)) {
      await apply.click();
    }
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/surface/i);
  });

  test('login page renders sign-in form', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response?.ok()).toBeTruthy();

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    // Scope to the credentials form so we don't match the header link
    // or the "Continue with Google" OAuth button.
    const form = page.locator('form').filter({ has: page.getByLabel(/password/i) });
    await expect(
      form.getByRole('button', { name: /sign in|log in|create account/i }),
    ).toBeVisible();
  });

  test('sitemap and robots are served', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBeTruthy();
    expect((await robots.text()).toLowerCase()).toContain('sitemap');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
    expect(await sitemap.text()).toContain('<urlset');
  });

  test('404 page handles unknown route', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-xyz123');
    expect(response?.status()).toBe(404);
    await expect(page.locator('body')).toContainText(/not found|404|can.?t find/i);
  });

  test('protected route redirects to login', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login/);
  });
});
