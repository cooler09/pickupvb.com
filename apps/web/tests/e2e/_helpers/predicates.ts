import type { Locator } from '@playwright/test';
import { errors } from '@playwright/test';

/**
 * Boolean visibility check that returns `false` on timeout instead of throwing.
 *
 * Replaces the `await loc.isVisible({ timeout }).catch(() => false)` pattern
 * sprinkled across the suite. The bare `.catch(() => false)` silently swallows
 * *every* error (selector-engine bugs, page crashes, etc.) — this helper only
 * eats `TimeoutError` and rethrows anything else so real failures surface.
 *
 * Uses `waitFor({ state: 'visible', timeout })` rather than `isVisible({ timeout })`
 * deliberately: Playwright's `isVisible({ timeout })` is a deprecated no-op
 * (instant snapshot — the `timeout` is ignored), so the old helper never
 * actually waited. `waitFor` honours `timeout`, so a `timeout` argument now
 * means what callers expect: poll for up to `timeout` ms for the element to
 * become visible, then report `false` if it never does.
 *
 * Use for branchy "is X present? if so, do Y" flows. Do NOT use as a substitute
 * for `expect(loc).toBeVisible()` — assertions still belong in assertions.
 */
export async function isVisibleOrTimeout(locator: Locator, timeout = 2_000): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch (err) {
    if (err instanceof errors.TimeoutError) return false;
    throw err;
  }
}
