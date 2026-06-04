import { test, expect } from './_helpers/fixtures';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { withAuthContext } from './_helpers/browser';
import { deleteBracketById } from './_helpers/cleanup';
import { recordFirstPendingMatch } from './_helpers/tournament';
import {
  addStandaloneTeams,
  createStandaloneBracket,
  seedAndGenerateStandaloneBracket,
  type CreatedStandaloneBracket,
} from './_helpers/standalone-bracket';

/**
 * Standalone (event-free) bracket flows — ADR 0025. The standalone-brackets
 * journal flagged this as the open gap: "No e2e yet. A Playwright spec
 * (create → add teams → seed → generate → record → open watch link) should be
 * added and run green against dev."
 *
 * Every test **self-provisions** a disposable bracket through the real UI as
 * the default per-worker attendee-a (a real, non-anonymous user — `requireRealUser`
 * gates `/brackets/new`) and tears it down in `finally`. Standalone brackets
 * have no UI delete path, so cleanup hard-deletes via the admin client
 * (`deleteBracketById`, opt-in via `E2E_CLEANUP_SUPABASE_*`; the fixture leaks
 * otherwise, matching the event bracket spec).
 *
 * The board itself (BoardView / MatchCard) is the same scope-agnostic component
 * the event path uses, so `recordFirstPendingMatch` from `_helpers/tournament`
 * drives it unchanged — the standalone-specific surface under test is the
 * create page, the typed-in-teams modal, the standalone seed/generate/record
 * server actions (which route the result write through `record_bracket_match_result`'s
 * owner branch), the owner-only workspace, and the public watch view.
 */

// Both tests provision a standalone bracket as the same free-tier owner
// (attendee-a), and free hosts may run only ONE active standalone bracket at a
// time (FREE_ACTIVE_BRACKET_CAP). Under the suite's `fullyParallel: true`, the
// two would otherwise create concurrently and the second would hit the cap wall.
// Serial mode keeps them sequential, so each test's `finally` teardown frees the
// slot before the next one creates.
test.describe.configure({ mode: 'serial' });

test.describe('standalone bracket — create → add → seed → generate → record → watch (ADR 0025)', () => {
  test('an owner builds a bracket end-to-end and the spectator watch link shows it live and read-only', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const tag = Date.now().toString(36);
    // Four distinct, unique names so getByText(exact) counts are unambiguous.
    const teams = [
      `E2E ${tag} Alpha`,
      `E2E ${tag} Bravo`,
      `E2E ${tag} Charlie`,
      `E2E ${tag} Delta`,
    ];
    let created: CreatedStandaloneBracket | null = null;

    try {
      created = await createStandaloneBracket(page, { bestOf: 1 });
      await addStandaloneTeams(page, created.id, teams);
      await seedAndGenerateStandaloneBracket(page, created.id);

      // Single-elim of 4 → exactly two playable round-1 matches; the final's
      // two slots are still TBD (no "Enter result" form there).
      await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(2);
      const before = await Promise.all(
        teams.map((t) => page.getByText(t, { exact: true }).count()),
      );
      expect(before, 'each of the 4 teams should appear in exactly one R1 match').toEqual([
        1, 1, 1, 1,
      ]);

      // Record one semifinal (top row wins 25–10) → its winner advances.
      await recordFirstPendingMatch(page);
      const after = await Promise.all(teams.map((t) => page.getByText(t, { exact: true }).count()));
      expect(
        after.filter((c) => c === 2),
        'exactly one team should have advanced into the final (appears in 2 cards)',
      ).toHaveLength(1);

      // Open the **public spectator watch link** from the workspace — the
      // headline affordance of standalone brackets (share a live bracket
      // without an event). Clicking the real link exercises the route.
      await page.getByRole('link', { name: /open public spectator view/i }).click();
      await page.waitForURL(new RegExp(`/brackets/${created.id}/watch`), { timeout: 15_000 });

      // The watch view renders the same board, live and read-only.
      await expect(page.getByRole('heading', { name: /live bracket/i })).toBeVisible({
        timeout: 15_000,
      });
      for (const t of teams) {
        await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
      }
      // Advancement is visible to spectators too — the advanced team shows in
      // both its completed semifinal and the final it fed into.
      const watch = await Promise.all(teams.map((t) => page.getByText(t, { exact: true }).count()));
      expect(
        watch.filter((c) => c === 2),
        'spectator view shows the advanced team in 2 cards',
      ).toHaveLength(1);
      // …but the spectator gets no result-entry affordance.
      await expect(page.locator('summary', { hasText: /^(Enter|Edit) result$/ })).toHaveCount(0);
      await expect(page.locator('input[name="set_a_1"]')).toHaveCount(0);
    } finally {
      if (created) await deleteBracketById(created.id);
    }
  });
});

test.describe('standalone bracket — non-owners get the read-only spectator view (ADR 0025)', () => {
  test('a signed-in non-owner visiting the workspace is redirected to the public watch view with no edit affordances', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');

    const tag = Date.now().toString(36);
    const teams = [`E2E ${tag} Home`, `E2E ${tag} Away`];
    let created: CreatedStandaloneBracket | null = null;

    try {
      // Owner (attendee-a) provisions a 2-team bracket → one playable final.
      created = await createStandaloneBracket(page, { bestOf: 1 });
      await addStandaloneTeams(page, created.id, teams);
      await seedAndGenerateStandaloneBracket(page, created.id);

      // Owner sees exactly one result-entry form (they own the bracket).
      await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(1);

      // attendee-b is not the owner. The workspace `/brackets/[id]` redirects
      // any non-owner to the public `/brackets/[id]/watch` view.
      await withAuthContext(browser, STORAGE_PATHS.attendeeB, async (bPage) => {
        await bPage.goto(`/brackets/${created!.id}`);
        await bPage.waitForURL(new RegExp(`/brackets/${created!.id}/watch`), { timeout: 15_000 });

        // Board renders for the spectator — both team names are visible…
        await expect(bPage.getByRole('heading', { name: /live bracket/i })).toBeVisible({
          timeout: 15_000,
        });
        await expect(bPage.getByText(teams[0]!, { exact: true }).first()).toBeVisible();
        await expect(bPage.getByText(teams[1]!, { exact: true }).first()).toBeVisible();

        // …but no result-entry UI: no Enter/Edit summary, no score inputs.
        await expect(bPage.locator('summary', { hasText: /^(Enter|Edit) result$/ })).toHaveCount(0);
        await expect(bPage.locator('input[name="set_a_1"]')).toHaveCount(0);
      });
    } finally {
      if (created) await deleteBracketById(created.id);
    }
  });
});
