import type { Browser, BrowserContext, Page } from '@playwright/test';

/**
 * Run `fn` against a fresh browser context seeded with `storageState`, and
 * always close the context afterwards.
 *
 * Replaces the hand-rolled `browser.newContext` + `try/finally { close() }`
 * block copy-pasted across the multi-actor specs (`event-host`, `groups`,
 * `player-social`, `teams` — e2e audit P2 #8). Centralizing it means the
 * context is *always* closed (some call sites swallowed `.close()` errors,
 * some forgot the `finally`) and the second-actor setup reads as one line.
 *
 * Pair with `skipIfMissingAuth(storageState, role)` *before* the call so a
 * missing secondary-role storage state skips gracefully instead of throwing
 * inside `newContext`:
 *
 * ```ts
 * skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');
 * await withAuthContext(browser, STORAGE_PATHS.attendeeB, async (page) => {
 *   await page.goto('/events');
 *   // ...assert as attendee B...
 * });
 * ```
 */
export async function withAuthContext<T>(
  browser: Browser,
  storageState: string,
  fn: (page: Page, context: BrowserContext) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  try {
    return await fn(page, context);
  } finally {
    await context.close();
  }
}
