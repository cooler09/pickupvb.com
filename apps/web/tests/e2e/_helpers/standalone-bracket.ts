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
 * Cleanup tears down with `deleteBracketById(id)` on the admin client (opt-in
 * via `E2E_CLEANUP_SUPABASE_*`; the fixture leaks otherwise, like the event
 * bracket spec). There **is** a UI delete now (TT-12), but the admin teardown is
 * deterministic and independent of the workspace render. The board
 * mutation/inspection (`recordFirstPendingMatch`,
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

  // Free hosts run one ACTIVE standalone bracket at a time (FREE_ACTIVE_BRACKET_CAP).
  // When already at the cap, /brackets/new renders an upgrade wall instead of the
  // format picker, so the best_of radio never mounts. Detect that explicitly and
  // fail fast with an actionable message rather than hanging the whole test on a
  // 180s wait for an element that will never appear. The usual cause is a leaked
  // active bracket from a prior run that didn't tear down — clear it (admin
  // hard-delete) and re-run. (This is also why the two tests in this spec run
  // `mode: 'serial'`: two concurrent free-tier creates would trip the same cap.)
  const capWall = page.getByText(/running a bracket already|run \d+ standalone bracket at a time/i);
  if (
    await capWall
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error(
      'standalone bracket create blocked by the free-tier active-bracket cap (an active ' +
        'bracket already exists for this account). Tear down the leaked bracket and re-run.',
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
 * seeding order, generate the bracket, then **publish** it. Mirrors the
 * event-path `createAndGenerateBracket` — the bracket is created with zero
 * seeds, so "Save seeding" must persist the order before `generate()` will run
 * (it throws "Need at least 2 seeded teams" otherwise).
 *
 * Since TT-11 (full draft→publish parity, ADR 0032) standalone `generate()`
 * lands in a **draft** workspace rather than going straight live, so this helper
 * clicks "Publish bracket" to take it active. Leaves the page on the active
 * board with at least one pending "Enter result" form.
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

  // draft → the DraftWorkspace renders a "Publish bracket" button.
  const publishBtn = page.getByRole('button', { name: /publish bracket/i });
  await expect(publishBtn).toBeVisible({ timeout: 15_000 });
  await publishBtn.click();

  // active → BoardView renders at least one pending "Enter result" form.
  await expect(page.locator('summary', { hasText: /^Enter result$/ }).first()).toBeVisible({
    timeout: 15_000,
  });
}
