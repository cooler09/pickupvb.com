import { expect, type Page } from '@playwright/test';
import { pickFutureDateTime } from './event-create';
import { isVisibleOrTimeout } from './predicates';

/**
 * Self-provisioning helpers for the bracket / tournament e2e specs (Phase 1,
 * e2e audit C3). The persistent `E2ETFR` seed stays read-only; mutating tests
 * build a disposable tournament here and tear it down in `finally`.
 *
 * The key enabler is the host-only **walk-in team** escape hatch
 * (`addAdHocTeamFromForm` in events/[id]/bracket/actions.ts): a single host
 * account can register ≥ 2 teams, create a bracket, seed it, generate it, and
 * record results — no second actor and no Stripe. That makes the "result
 * advances the winner" assertion (C3's headline) drivable end-to-end by one
 * signed-in host.
 */

export interface CreatedTournament {
  /** Detail URL with the `?created=1` flash query stripped. */
  url: string;
  id: string;
}

export interface CreateAdHocTournamentOptions {
  title: string;
  /** Division label (required by the form). Defaults to 'Open'. */
  divisionLabel?: string;
  startTime?: string;
  endTime?: string;
}

/**
 * Drive `/events/new` to create a free, single-division **ad-hoc** tournament.
 * The division repeater defaults (ad-hoc team registration, free, unlimited)
 * are exactly what the walk-in bracket flow needs, so only the label is filled.
 * Returns the detail URL + uuid.
 *
 * Caller owns cleanup — `cancelEvent(page, url)` + `deleteEventById(id)`.
 */
export async function createAdHocTournament(
  page: Page,
  opts: CreateAdHocTournamentOptions,
): Promise<CreatedTournament> {
  const start = opts.startTime ?? '18:00';
  const end = opts.endTime ?? '20:00';
  const divisionLabel = opts.divisionLabel ?? 'Open';

  await page.goto('/events/new');
  if (page.url().includes('/login') || page.url().includes('/upgrade')) {
    throw new Error(
      `redirected to ${new URL(page.url()).pathname} — tournament creation gated for this account`,
    );
  }

  // Switch the type to Tournament. The TypeCard is a <label> wrapping an
  // sr-only radio; target the label *by the radio it contains* (unambiguous —
  // exactly one such label) and click it to toggle the type and reveal the
  // required DivisionsRepeater row.
  await page
    .locator('label')
    .filter({ has: page.locator('input[name="type"][value="tournament"]') })
    .click();

  await page.locator('#title').fill(opts.title);
  await pickFutureDateTime(page, 'startsAt', start);
  await pickFutureDateTime(page, 'endsAt', end);

  // Address — same convention-center recipe as createFreeOpenPlayEvent
  // (geocodes reliably; the detail fields collapse once addressLine is set,
  // so reopen them if needed).
  await page.locator('#addressLine').fill('1000 19th St');
  const editDetailsBtn = page.getByRole('button', { name: /edit address details/i });
  if (await isVisibleOrTimeout(editDetailsBtn, 1_000)) {
    await editDetailsBtn.click();
  }
  await page.locator('#city').fill('Virginia Beach');
  await page.locator('#region').fill('VA');
  await page.locator('#postalCode').fill('23451');
  await page.locator('#country').fill('US');

  // Division 0 — only the label is required; ad_hoc / team / unlimited / free
  // are the repeater defaults.
  await page.locator('input[name="div_0_label"]').fill(divisionLabel);

  await page.getByRole('button', { name: /create event/i }).click();

  await page.waitForURL(/\/events\/[0-9a-f-]{36}(\?|$)/, { timeout: 20_000 }).catch(async () => {
    const currentUrl = page.url();
    const errors = await page
      .locator('[role="alert"], .text-error, [class*="error"]')
      .allTextContents()
      .catch(() => [] as string[]);
    throw new Error(
      `tournament submit did not redirect (stayed on ${currentUrl}); visible errors: ${JSON.stringify(errors.slice(0, 5))}`,
    );
  });

  const url = page.url().replace(/\?.*$/, '');
  const match = /\/events\/([0-9a-f-]{36})/.exec(url);
  if (!match) throw new Error(`could not extract event id from ${url}`);
  return { url, id: match[1]! };
}

/**
 * Register walk-in teams into the tournament's (only) division via the bracket
 * page's "+ Add teams" modal (the unified `WalkInTeamForm`, shared with the
 * standalone path). The modal **stays open across adds** — each "Add team" /
 * "Add another" submit returns a typed result (no redirect) and revalidates the
 * bracket page behind the modal — so we add every team in one session and
 * confirm each via the modal's "✓ Added this session (n)" tally, then close with
 * "Done". Settles on the format picker reflecting the new team count.
 *
 * Note: the event form renders an optional Players (roster) fieldset, so the
 * team-name field is targeted by its placeholder, not `getByRole('textbox')`.
 */
export async function addWalkInTeams(
  page: Page,
  eventId: string,
  names: readonly string[],
): Promise<void> {
  await page.goto(`/events/${eventId}/bracket`);

  // Trigger reads "+ Add teams" (promoted to a primary CTA while the host
  // can't generate yet). Opens the FormModal holding WalkInTeamForm.
  await page
    .getByRole('button', { name: /add teams/i })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const nameInput = dialog.getByPlaceholder(/e\.g\. Block Party/i);
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

  // The FormatPickerForm re-renders with the new teamCount once the revalidation
  // lands; its estimate line reads "… with <n> teams." (only for n ≥ 2).
  await expect(page.getByText(new RegExp(`with ${names.length} team`, 'i')).first()).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * The four bracket formats the host can pick on the FormatPickerForm. Each
 * carries a `minTeams` the form enforces (single 2, double/round-robin 3, pool
 * play 4) — register at least that many walk-in teams before generating, or the
 * "Create bracket" button stays disabled. See `format-picker-form.tsx`.
 */
export type WalkInBracketFormat =
  | 'single_elimination'
  | 'double_elimination'
  | 'round_robin'
  | 'pool_play_playoff';

/**
 * From the bracket page (with ≥ minTeams registered, no bracket yet): pick
 * best-of-1 (one set decides each match — fast + deterministic), select the
 * format (defaults to single elimination), create the bracket, **save the
 * seeding**, then generate it. Stops on the **draft workspace** (ADR 0032):
 * `generate()` lands in `draft`, so the page shows "Publish bracket" rather
 * than the live scoring board.
 *
 * The save-seeding step is mandatory: `CreateBracketHandler` creates the
 * bracket in `setup` with **zero** seeds, and `bracket.generate()` throws
 * "Need at least 2 seeded teams" until the host persists the seeding order.
 */
export async function createBracketToDraft(
  page: Page,
  eventId: string,
  opts?: { format?: WalkInBracketFormat },
): Promise<void> {
  const format = opts?.format ?? 'single_elimination';
  await page.goto(`/events/${eventId}/bracket`);

  // Best of 1 — label wraps an sr-only radio; target by the radio it contains
  // so we never strict-mode-collide with "Best of 3" / "Best of 5".
  await page
    .locator('label')
    .filter({ has: page.locator('input[name="best_of"][value="1"]') })
    .click();
  // single_elimination is the default-selected format card; only the others
  // need an explicit click. Each card is a <label> wrapping an sr-only radio,
  // so target it by the radio it contains (same pattern as best_of).
  if (format !== 'single_elimination') {
    await page
      .locator('label')
      .filter({ has: page.locator(`input[name="format"][value="${format}"]`) })
      .click();
  }
  await page.getByRole('button', { name: /create bracket/i }).click();

  // setup → SetupView renders both "Save seeding" and "Generate bracket".
  const saveSeeding = page.getByRole('button', { name: /save seeding/i });
  await expect(saveSeeding).toBeVisible({ timeout: 15_000 });
  await saveSeeding.click();
  await page.waitForURL(/notice=seeded/, { timeout: 15_000 });

  const generateBtn = page.getByRole('button', { name: /generate bracket/i });
  await expect(generateBtn).toBeVisible({ timeout: 15_000 });
  await generateBtn.click();

  // draft → DraftWorkspace renders the Publish CTA.
  await expect(page.getByRole('button', { name: /publish bracket/i })).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Create + seed + generate, then **publish** so the bracket goes live. Leaves
 * the page on the active board (≥ 1 pending "Enter result" form). The seam
 * between this and {@link createBracketToDraft} is the ADR 0032 draft→live
 * boundary; most scoring specs just want a live board, so they call this.
 */
export async function createAndGenerateBracket(
  page: Page,
  eventId: string,
  opts?: { format?: WalkInBracketFormat },
): Promise<void> {
  await createBracketToDraft(page, eventId, opts);
  await page.getByRole('button', { name: /publish bracket/i }).click();

  // active → BoardView renders at least one pending "Enter result" form.
  await expect(page.locator('summary', { hasText: /^Enter result$/ }).first()).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Record a result for the first pending match on the board. Best-of-1 default
 * scores (25–10) give team A (the top row) the win, so that match's first-listed
 * team advances. Waits on the count of *completed* ("Edit result") cards
 * increasing by one — a deterministic post-redirect settle signal that holds
 * even as a downstream match becomes newly playable.
 */
export async function recordFirstPendingMatch(
  page: Page,
  opts?: { winner?: 'a' | 'b' },
): Promise<void> {
  const completed = page.locator('summary', { hasText: /^Edit result$/ });
  const before = await completed.count();

  const detail = page
    .locator('details', { has: page.locator('summary', { hasText: /^Enter result$/ }) })
    .first();
  await detail.locator('summary').first().click();

  const [a, b] = opts?.winner === 'b' ? ['10', '25'] : ['25', '10'];
  await detail.locator('input[name="set_a_1"]').fill(a);
  await detail.locator('input[name="set_b_1"]').fill(b);
  await detail.getByRole('button', { name: /^save$/i }).click();

  await expect(completed).toHaveCount(before + 1, { timeout: 15_000 });
}

/**
 * Record every currently-playable match, repeatedly, until none remain — each
 * recorded result can make a downstream match newly playable (winners→losers
 * drop, grand-final advancement, pool→playoff). Team A (the top row) always
 * wins, so the walk-through is deterministic. Caps at `maxMatches` iterations so
 * a generator that never resolves can't spin forever. Returns the number
 * recorded. Used by the multi-round format specs (double elim, pool playoff)
 * where the exact match count is generator-defined rather than a fixed tree.
 */
export async function recordAllPlayableMatches(page: Page, maxMatches = 24): Promise<number> {
  let recorded = 0;
  for (let i = 0; i < maxMatches; i++) {
    if ((await page.locator('summary', { hasText: /^Enter result$/ }).count()) === 0) break;
    await recordFirstPendingMatch(page);
    recorded++;
  }
  return recorded;
}

/**
 * Clear (reset) the first completed match on the board via its "Edit result" →
 * "Clear" affordance. Reverts that match to pending and — per the domain
 * `resetMatch` contract — recursively rolls back any downstream match that
 * consumed its winner. Settles on the `notice=match_reset` redirect, the
 * deterministic post-action signal (mirrors `createAndGenerateBracket`'s
 * wait on `notice=seeded`).
 */
export async function resetFirstCompletedMatch(page: Page): Promise<void> {
  const detail = page
    .locator('details', { has: page.locator('summary', { hasText: /^Edit result$/ }) })
    .first();
  await detail.locator('summary').first().click();
  await detail.getByRole('button', { name: /^clear$/i }).click();
  await page.waitForURL(/notice=match_reset/, { timeout: 15_000 });
}
