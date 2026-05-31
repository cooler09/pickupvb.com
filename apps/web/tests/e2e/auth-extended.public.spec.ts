import { test, expect } from '@playwright/test';
import { isVisibleOrTimeout } from './_helpers/predicates';

/**
 * Extended authentication — public-facing form behavior covering sign-up mode
 * validation and anonymous/guest session edge cases (Sections 1.1 and 1.4).
 *
 * All tests are public: no storageState required.
 */

test.describe('sign-up form', () => {
  test('sign-up mode shows email and password fields', async ({ page }) => {
    await page.goto('/login');

    // Locate the sign-up toggle — may be a link, button, or tab.
    const signUpToggle = page
      .getByRole('button', { name: /sign up|create account|register/i })
      .or(page.getByRole('link', { name: /sign up|create account|register/i }))
      .or(page.getByRole('tab', { name: /sign up|create account|register/i }))
      .first();

    if ((await signUpToggle.count()) > 0) {
      await signUpToggle.click();
      await page.waitForLoadState('domcontentloaded');
    }
    // If no toggle, the page may already be in sign-up mode or a unified form.

    // Either way, email and password inputs must be visible.
    await expect(page.getByLabel(/email/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/password/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('submitting with invalid email format shows error', async ({ page }) => {
    await page.goto('/login');

    // Attempt to switch to sign-up mode.
    const signUpToggle = page
      .getByRole('button', { name: /sign up|create account|register/i })
      .or(page.getByRole('link', { name: /sign up|create account|register/i }))
      .or(page.getByRole('tab', { name: /sign up|create account|register/i }))
      .first();

    if ((await signUpToggle.count()) > 0) {
      await signUpToggle.click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Fall back to /register if the /login page has no sign-up mode.
    const emailInput = page.getByLabel(/email/i).first();
    await expect(emailInput).toBeVisible({ timeout: 10_000 });

    await emailInput.fill('notanemail');
    await page
      .getByLabel(/password/i)
      .first()
      .fill('Password123!');

    const form = page.locator('form').filter({ has: page.getByLabel(/password/i) });
    await form
      .getByRole('button', { name: /sign up|create account|register|sign in|log in/i })
      .first()
      .click();

    await page.waitForLoadState('domcontentloaded');

    // Validation can surface via browser constraint, inline error, or toast.
    // The email field should be invalid OR the body should contain an error message.
    const isInvalid = await emailInput.evaluate((el) =>
      (el as HTMLInputElement).validity ? !(el as HTMLInputElement).validity.valid : false,
    );
    const bodyHasError = await isVisibleOrTimeout(
      page
        .locator('body')
        .getByText(/invalid email|email.*invalid|enter.*valid email|check.*email|error/i)
        .first(),
    );
    expect(isInvalid || bodyHasError).toBe(true);
  });

  test('submitting with short password shows error', async ({ page }) => {
    await page.goto('/login');

    const signUpToggle = page
      .getByRole('button', { name: /sign up|create account|register/i })
      .or(page.getByRole('link', { name: /sign up|create account|register/i }))
      .or(page.getByRole('tab', { name: /sign up|create account|register/i }))
      .first();

    if ((await signUpToggle.count()) > 0) {
      await signUpToggle.click();
      await page.waitForLoadState('domcontentloaded');
    }

    const emailInput = page.getByLabel(/email/i).first();
    await expect(emailInput).toBeVisible({ timeout: 10_000 });

    await emailInput.fill('test-e2e-invalid@pickupvb.test');
    await page
      .getByLabel(/password/i)
      .first()
      .fill('abc');

    const form = page.locator('form').filter({ has: page.getByLabel(/password/i) });
    await form
      .getByRole('button', { name: /sign up|create account|register|sign in|log in/i })
      .first()
      .click();

    await page.waitForLoadState('domcontentloaded');

    // Either the password field is browser-invalid OR the page shows a length error.
    const passwordInput = page.getByLabel(/password/i).first();
    const isInvalid = await passwordInput.evaluate((el) =>
      (el as HTMLInputElement).validity ? !(el as HTMLInputElement).validity.valid : false,
    );
    const bodyHasError = await isVisibleOrTimeout(
      page
        .locator('body')
        .getByText(
          /password.*short|short.*password|at least.*character|minimum.*character|password.*length|error/i,
        )
        .first(),
    );
    expect(isInvalid || bodyHasError).toBe(true);
  });

  test.fixme(
    'duplicate email shows already-registered error — requires a disposable email service to complete the sign-up confirmation step',
  );

  test.fixme('email confirmation flow — requires email inbox access');
});

test.describe('anonymous / guest session', () => {
  test('clicking join on an event while signed out prompts authentication', async ({ page }) => {
    await page.goto('/events');

    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available in this environment; skipping');
    }

    const href = (await eventLink.getAttribute('href')) ?? '/events';
    const response = await page.goto(href);

    // The detail page must not 500.
    expect(response?.status()).not.toBe(500);

    // Look for a join / RSVP / attend type button or link.
    const joinEl = page
      .getByRole('button', { name: /join|rsvp|attend|sign up/i })
      .or(page.getByRole('link', { name: /join|rsvp|attend|sign up/i }))
      .first();

    if ((await joinEl.count()) === 0) {
      test.skip(true, 'No join/RSVP button found on this event page; skipping');
    }

    await joinEl.click();
    await page.waitForLoadState('domcontentloaded');

    // Accept: redirect to /login, OR a sign-in modal, OR a guest start flow.
    const urlHasLogin = page.url().includes('/login');
    const hasAuthModal = await isVisibleOrTimeout(
      page.getByText(/sign in|log in|create account|continue with/i).first(),
      10_000,
    );
    const hasGuestFlow = await isVisibleOrTimeout(
      page.getByText(/guest|continue as|without account/i).first(),
      10_000,
    );

    expect(urlHasLogin || hasAuthModal || hasGuestFlow).toBe(true);
  });

  test('/claim page loads', async ({ page }) => {
    const response = await page.goto('/claim');

    // /claim may redirect to /login (auth required) or render directly.
    if (!response) {
      // Navigation completed via redirect; check final URL.
      await expect(page).toHaveURL(/\/login|\/claim/);
      return;
    }

    const status = response.status();
    // 200 or a 3xx-followed-to redirect are both valid.
    const finalUrl = page.url();
    if (finalUrl.includes('/login')) {
      // Redirected to login — acceptable.
      await expect(page).toHaveURL(/\/login/);
    } else {
      // Rendered the claim page directly.
      expect(status).toBe(200);
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    }
  });
});
