import { test, expect } from '@playwright/test';
import { isVisibleOrTimeout } from './_helpers/predicates';

/**
 * Greg Nolan (P13) — the anonymous guest who claims later. docs/personas.md.
 *
 * Greg has NO pre-provisioned account, so this is a `.public.spec.ts` (the
 * `public` project — no auth, no storageState; imports from `@playwright/test`,
 * not the auth fixtures). His full arc — guest RSVP via Supabase anonymous auth
 * (Turnstile-gated) → claim into a real account preserving history — needs a
 * runtime anon session + Turnstile, so the mutating steps are fixme. The
 * read-only guards (the claim gate, the public RSVP affordance) run now.
 */

test.describe('Greg Nolan (P13) — anonymous guest', () => {
  test('/claim with no session redirects to the sign-up flow', async ({ page }) => {
    await page.goto('/claim');
    await page.waitForLoadState('domcontentloaded');
    // ClaimPage redirects a session-less visitor to /login?mode=sign-up.
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 10_000 });
  });

  test('a public event page offers a join / RSVP affordance to a signed-out visitor', async ({
    page,
  }) => {
    await page.goto('/events');
    await page.waitForLoadState('domcontentloaded');
    const eventLink = page.locator('a[href*="/events/"]').first();
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No public events in this environment to open as a guest');
    }
    const href = await eventLink.getAttribute('href');
    await page.goto(href!);
    await page.waitForLoadState('domcontentloaded');
    // A guest sees a path into the event: RSVP / Join / Reserve / Sign in.
    const hasCta = await isVisibleOrTimeout(
      page
        .getByRole('button', { name: /rsvp|join|reserve|sign up|i'?m in/i })
        .or(page.getByRole('link', { name: /rsvp|join|reserve|sign in|sign up|log in/i }))
        .first(),
      8_000,
    );
    expect(hasCta).toBe(true);
  });

  // Anonymous RSVP needs the Turnstile gate; the claim upgrade needs a live
  // anon session to promote. features.md § 15.
  test.fixme('guest RSVPs without an account (anonymous auth, Turnstile-gated)', async () => {});
  test.fixme('claims the guest account → real login, RSVP history preserved, no duplicates', async () => {});
});
