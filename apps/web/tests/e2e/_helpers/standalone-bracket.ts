import { expect, type Page } from '@playwright/test';

/**
 * Self-provisioning helpers for the **standalone bracket** e2e spec (ADR 0025 —
 * event-free, owner-scoped brackets). The journal entry
 * `docs/journal/2026-05-30-standalone-brackets.md` flagged the gap: "No e2e
 * yet. A Playwright spec (create → add teams → seed → generate → record → open
 * watch link) should be added and run green against dev."
 *
 * Unlike leagues (which have no UI provisioning path and need the admin client),
 * standalone brackets have a full UI create flow at `/brackets/new`, so the
 * spec self-provisions entirely through the real UI as the default per-worker
 * attendee-a — one signed-in real user drives create → add → seed → generate →
 * record → watch. No second actor, no Stripe, no admin client to stand it up.
 *
 * Cleanup is admin-only: there is **no UI delete path** for a standalone
 * bracket, so callers tear down with `deleteBracketById(id)` (opt-in via
 * `E2E_CLEANUP_SUPABASE_*`; the fixture leaks otherwise, like the event
 * bracket spec). The board mutation/inspection (`recordFirstPendingMatch`,
 * etc.) is reused from `./tournament` — the BoardView / MatchCard components
 * are scope-agnostic, so the same board ops drive event and standalone alike.
 */

export interface CreatedStandaloneBracket {
  /** Workspace URL with the `?notice=` flash query stripped. */
  url: string;
  id: string;
}

/**
 * Drive `/brackets/new` to create a standalone single-elimination bracket.
 * The create form has `enforceMinTeams={false}` + `teamCount={0}`, so "Create
 * bracket" is enabled with zero teams (teams are typed in afterwards). Selects
 * Best-of-1 by default (one set decides each match — fast + deterministic,
 * mirroring `createAndGenerateBracket`). Returns the workspace URL + uuid.
 *
 * Caller owns cleanup — `deleteBracketById(id)`.
 */
export async function createStandaloneBracket(
  page: Page,
  opts?: { bestOf?: 1 | 3 | 5 },
): Promise<CreatedStandaloneBracket> {
  const bestOf = opts?.bestOf ?? 1;

  await page.goto('/brackets/new');
  if (page.url().includes('/login') || page.url().includes('/upgrade')) {
    throw new Error(
      `redirected to ${new URL(page.url()).pathname} — standalone bracket creation gated for this account`,
    );
  }

  // Best of N — label wraps an sr-only radio; target by the radio it contains
  // so we never strict-mode-collide with the other "Best of" cards.
  await page
    .locator('label')
    .filter({ has: page.locator(`input[name="best_of"][value="${bestOf}"]`) })
    .click();

  // single_elimination is the default-selected format.
  await page.getByRole('button', { name: /create bracket/i }).click();

  // Redirect to /brackets/<uuid> (the 36-char uuid distinguishes it from the
  // /brackets/new create page).
  await page.waitForURL(/\/brackets\/[0-9a-f-]{36}(\?|$)/, { timeout: 20_000 }).catch(async () => {
    const currentUrl = page.url();
    const errors = await page
      .locator('[role="alert"]')
      .allTextContents()
      .catch(() => [] as string[]);
    throw new Error(
      `standalone bracket submit did not redirect (stayed on ${currentUrl}); visible errors: ${JSON.stringify(errors.slice(0, 5))}`,
    );
  });

  const url = page.url().replace(/\?.*$/, '');
  const match = /\/brackets\/([0-9a-f-]{36})/.exec(url);
  if (!match) throw new Error(`could not extract bracket id from ${url}`);
  return { url, id: match[1]! };
}

/**
 * Add typed-in teams via the workspace's "+ Add teams" modal. Standalone teams
 * are names only (the modal is rendered with `showRoster={false}`), and the
 * modal **stays open across adds** — `addBracketTeamFromClient` is a
 * client-invoked action that returns a typed result (no redirect) and
 * revalidates the workspace behind the modal, so we add every team in one
 * session and confirm each via the modal's "✓ Added this session (n)" tally.
 * Closes with "Done" and settles on the workspace header's team count.
 */
export async function addStandaloneTeams(
  page: Page,
  bracketId: string,
  names: readonly string[],
): Promise<void> {
  await page.goto(`/brackets/${bracketId}`);

  // The standalone trigger reads "+ Add teams" (event path: "+ Add walk-in
  // teams"). Promoted to primary while the host can't generate yet.
  await page
    .getByRole('button', { name: /add teams/i })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // showRoster=false ⇒ the team-name field is the only text input in the
  // modal (it carries no `name` attribute — it's a controlled input).
  const nameInput = dialog.getByRole('textbox');

  for (let i = 0; i < names.length; i++) {
    await nameInput.fill(names[i]!);
    // Submit label is "Add team" on the first add, "Add another" after.
    await dialog.getByRole('button', { name: /^(add team|add another)$/i }).click();
    await expect(
      dialog.getByText(new RegExp(`Added this session \\(${i + 1}\\)`, 'i')),
    ).toBeVisible({ timeout: 15_000 });
  }

  // "Done" appears once ≥ 1 team has been added; closes the modal.
  await dialog.getByRole('button', { name: /^done$/i }).click();

  // Workspace header reflects the new count once the revalidation lands. The
  // header <p> renders exactly "<n> team(s)"; an exact match avoids colliding
  // with the SetupView card's "<n> teams seeded" (and the site-nav <header>).
  const countLabel = `${names.length} team${names.length === 1 ? '' : 's'}`;
  await expect(page.getByText(countLabel, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * From the workspace (status `setup`, ≥ 2 teams added): save the current
 * seeding order, then generate the bracket. Mirrors the event-path
 * `createAndGenerateBracket` — the bracket is created with zero seeds, so
 * "Save seeding" must persist the order before `generate()` will run (it
 * throws "Need at least 2 seeded teams" otherwise). Leaves the page on the
 * active board with at least one pending "Enter result" form.
 */
export async function seedAndGenerateStandaloneBracket(
  page: Page,
  bracketId: string,
): Promise<void> {
  await page.goto(`/brackets/${bracketId}`);

  const saveSeeding = page.getByRole('button', { name: /save seeding/i });
  await expect(saveSeeding).toBeVisible({ timeout: 15_000 });
  await saveSeeding.click();
  await page.waitForURL(/notice=seeded/, { timeout: 15_000 });

  const generateBtn = page.getByRole('button', { name: /generate bracket/i });
  await expect(generateBtn).toBeVisible({ timeout: 15_000 });
  await generateBtn.click();

  // active → BoardView renders at least one pending "Enter result" form.
  await expect(page.locator('summary', { hasText: /^Enter result$/ }).first()).toBeVisible({
    timeout: 15_000,
  });
}
