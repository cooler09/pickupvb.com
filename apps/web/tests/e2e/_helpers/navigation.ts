import { expect, type Page } from '@playwright/test';

/**
 * Shared navigation / discovery helpers for the authed specs.
 *
 * Each of these was copy-pasted across sibling specs before the e2e audit
 * (P2 #6): `findOwnedGroupUrl` lived in BOTH `groups` and `groups-manage`
 * (the latter's comment literally read "Mirrors the helper in groups…"),
 * `ensureSearchableDisplayName` in BOTH `groups` and `teams`, and
 * `findCaptainedTeamUrl` followed the same shape in `teams`. Centralizing
 * them here makes the discovery logic a single source of truth.
 */

/**
 * Find a group the signed-in user is listed under on /profile. Returns the
 * group URL (path, trailing slash stripped) or `null`. Callers probe
 * `<url>/edit` or `<url>/members` to confirm management rights.
 */
export async function findOwnedGroupUrl(page: Page): Promise<string | null> {
  await page.goto('/profile');
  await page.waitForLoadState('domcontentloaded');
  const groupLinks = page.locator('a[href*="/groups/"]');
  const count = await groupLinks.count();
  for (let i = 0; i < count; i++) {
    const href = await groupLinks.nth(i).getAttribute('href');
    if (!href || href.includes('/edit') || href.includes('/members') || href.includes('/new'))
      continue;
    return href.replace(/\/$/, '');
  }
  return null;
}

/**
 * Find a team URL the current user captains by loading /teams and reading the
 * "Captained" section of the MyTeamsPanel (a client component that hydrates
 * after navigation). Returns `null` cleanly if no team is captained.
 */
export async function findCaptainedTeamUrl(page: Page): Promise<string | null> {
  await page.goto('/teams');

  // MyTeamsPanel hydrates after navigation — poll for a captained team link
  // rather than guessing with a fixed sleep.
  const teamLink = page
    .locator('section')
    .filter({ hasText: /captained/i })
    .first()
    .locator('a[href*="/teams/"]')
    .first();

  try {
    await expect(teamLink).toBeVisible({ timeout: 10_000 });
  } catch {
    return null;
  }
  return await teamLink.getAttribute('href');
}

/**
 * Ensure the signed-in profile has a unique, searchable `display_name` the
 * UserPicker's `ilike` search can hit, and return it. The typeahead matches
 * against `profiles_public.display_name`; seeded test users may have an
 * email-prefix or empty value that isn't reliably searchable.
 *
 * Idempotent: if the current `display_name` already starts with `prefix`, the
 * helper returns it as-is without re-saving.
 */
export async function ensureSearchableDisplayName(page: Page, prefix: string): Promise<string> {
  await page.goto('/profile');
  await page.waitForLoadState('domcontentloaded');
  const dnInput = page.locator('input[name="display_name"]').first();
  await expect(dnInput).toBeVisible({ timeout: 10_000 });
  const current = await dnInput.inputValue();
  if (current && current.startsWith(prefix)) return current;

  const next = `${prefix} ${Math.random().toString(36).slice(2, 7)}`;
  await dnInput.fill(next);
  await page
    .getByRole('button', { name: /save changes|save profile|update profile/i })
    .first()
    .click();
  // Wait for the success Alert ("Profile updated.") or for the input value to
  // be persisted after the server action returns.
  await page
    .getByText(/profile updated/i)
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => {
      /* tolerate no alert; we re-check value below */
    });
  await page.waitForLoadState('domcontentloaded');
  return next;
}
