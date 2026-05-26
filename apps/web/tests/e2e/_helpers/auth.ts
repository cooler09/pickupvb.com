import { test as setup, test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Shared sign-in flow for every `auth.*.setup.ts` file.
 *
 * Behaviour matches the original hand-written setups:
 *   1. Visit /login, fill credentials, submit (scoped to the credentials
 *      form so we don't match the header link or the Google OAuth button).
 *   2. Wait for the post-login redirect to /events.
 *   3. Sanity-check that /profile loads (i.e. session cookie is valid).
 *   4. Persist storageState to `storagePath`.
 *
 * `onMissingEnv` controls what happens when the env vars are absent:
 *   - 'throw' (primary attendee-a setup): hard-fail the whole authed run.
 *   - 'skip'  (every secondary role): skip this one setup and let any
 *             dependent test call `skipIfMissingAuth(storagePath, role)`
 *             at runtime.
 */
export interface DefineAuthSetupOptions {
  role: string;
  email: string | undefined;
  password: string | undefined;
  storagePath: string;
  /** Env-var names to mention in skip / error messages. */
  emailEnvVar: string;
  passwordEnvVar: string;
  onMissingEnv: 'throw' | 'skip';
}

export function defineAuthSetup(opts: DefineAuthSetupOptions): void {
  setup(`authenticate ${opts.role}`, async ({ page }) => {
    if (!opts.email || !opts.password) {
      const msg = `${opts.emailEnvVar} / ${opts.passwordEnvVar} not set; skipping ${opts.role} auth setup`;
      if (opts.onMissingEnv === 'throw') {
        throw new Error(
          `${opts.emailEnvVar} and ${opts.passwordEnvVar} must be set to run authenticated tests.`,
        );
      }
      setup.skip(true, msg);
      return;
    }

    await signIn(page, opts.email, opts.password);

    // Sanity: hitting /profile should now load (not redirect to /login).
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/);

    fs.mkdirSync(path.dirname(opts.storagePath), { recursive: true });
    await page.context().storageState({ path: opts.storagePath });
  });
}

/**
 * Low-level sign-in primitive shared by `defineAuthSetup` and any future
 * programmatic sign-in helpers. Scoped to the credentials form to avoid
 * matching the header "Sign in" link or the OAuth button.
 */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  const form = page.locator('form').filter({ has: page.getByLabel(/password/i) });
  await form.getByRole('button', { name: /sign in|log in|create account/i }).click();
  await page.waitForURL(/\/events(\b|$)/, { timeout: 15_000 });
}

/**
 * Use at the top of an authed test (or in `beforeAll`) when the test
 * depends on a secondary role's storage state. If the env vars for that
 * role weren't set, the corresponding auth setup was skipped and no
 * storageState file exists — skip gracefully instead of failing.
 *
 * ```ts
 * skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');
 * const bContext = await browser.newContext({ storageState: STORAGE_PATHS.attendeeB });
 * ```
 */
export function skipIfMissingAuth(storagePath: string, role: string): void {
  if (!fs.existsSync(storagePath)) {
    test.skip(true, `${role} auth state not found at ${storagePath} (env var not set?)`);
  }
}
