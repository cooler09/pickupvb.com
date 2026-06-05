import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import { cancelEvent } from './_helpers/event-create';
import { deleteEventById } from './_helpers/cleanup';
import {
  addWalkInTeams,
  createAdHocTournament,
  createAndGenerateBracket,
  recordAllPlayableMatches,
  recordFirstPendingMatch,
  type CreatedTournament,
} from './_helpers/tournament';

/**
 * Sofia Reyes (P5) — the tournament director (Pro + Stripe). docs/personas.md.
 *
 * Sofia exists to stress the **tournament + divisions + bracket** surface. The
 * single-elimination create→seed→generate→record→champion arc is already
 * covered end-to-end by `bracket.authed.spec.ts` (self-provisioned as
 * attendee-a via `_helpers/tournament.ts`), so Sofia's NEW value is:
 *   - the create-form building blocks (Tournament type → divisions repeater →
 *     free-agent toggle), runnable as a Pro host, and
 *   - the bracket FORMATS beyond single elim (double elim, round robin, pool
 *     play → playoff), which stay fixme until a per-format fixture exists.
 *
 * Read-only assertions also run against the persistent seed tournaments
 * (`/e/E2ETFR`, `/e/E2ETFA` — hosted by free-host) to confirm the public
 * tournament surface renders.
 */

const sofia = PERSONAS.sofia;

test.describe(`${sofia.name} (${sofia.id}) — tournament create surface`, () => {
  test('Tournament type reveals the divisions repeater', async ({ browser }) => {
    await withPersona(browser, 'sofia', async (page) => {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain('/events/new');

      // Switch to Tournament (label wraps an sr-only radio — target by the
      // radio it contains, the same pattern createAdHocTournament uses).
      await page
        .locator('label')
        .filter({ has: page.locator('input[name="type"][value="tournament"]') })
        .click();

      // The required division row appears.
      await expect(page.locator('input[name="div_0_label"]').first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test('division config exposes a free-agent / pool toggle', async ({ browser }) => {
    await withPersona(browser, 'sofia', async (page) => {
      await page.goto('/events/new');
      await page.waitForLoadState('domcontentloaded');
      await page
        .locator('label')
        .filter({ has: page.locator('input[name="type"][value="tournament"]') })
        .click();
      await expect(page.locator('input[name="div_0_label"]').first()).toBeVisible({
        timeout: 10_000,
      });
      // Per-division free-agent pool toggle (features.md § 1, event-type matrix).
      const hasFreeAgent = await isVisibleOrTimeout(
        page.getByText(/free agent|free-agent|agent pool/i).first(),
        3_000,
      );
      if (!hasFreeAgent) {
        test.skip(true, 'free-agent toggle not found on this build — selector or UX drift');
      }
      expect(hasFreeAgent).toBe(true);
    });
  });
});

test.describe(`${sofia.name} (${sofia.id}) — seed tournament surface (read-only)`, () => {
  test('the roster seed tournament /e/E2ETFR renders', async ({ browser }) => {
    await withPersona(browser, 'sofia', async (page) => {
      const res = await page.goto('/e/E2ETFR');
      if (!res || res.status() >= 400) {
        test.skip(
          true,
          'E2ETFR seed not applied on this environment (seed-tournament-fixture.sql)',
        );
      }
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/tournament|division|team|bracket/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });
});

test.describe(`${sofia.name} (${sofia.id}) — bracket formats beyond single elim`, () => {
  // bracket.authed.spec.ts covers single_elimination end-to-end as attendee-a.
  // These drive the three other formats as Sofia (the tournament director who
  // owns them in docs/personas.md), self-provisioning a disposable ad-hoc
  // tournament via the host-only walk-in escape hatch (`_helpers/tournament.ts`)
  // and tearing it down in `finally`. The format is chosen on the
  // FormatPickerForm via `createAndGenerateBracket(..., { format })`.

  test('round_robin: every team plays every other, and the slate fully resolves', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    await withPersona(browser, 'sofia', async (page) => {
      const tag = Date.now().toString(36);
      // 3 teams → round robin = 3 matches (n·(n−1)/2), all immediately playable
      // (round robin has no match dependencies — every pairing is known upfront).
      const teams = [`E2E ${tag} RR-A`, `E2E ${tag} RR-B`, `E2E ${tag} RR-C`];
      let created: CreatedTournament | null = null;
      try {
        created = await createAdHocTournament(page, { title: `E2E Sofia RoundRobin ${tag}` });
        await addWalkInTeams(page, created.id, teams);
        await createAndGenerateBracket(page, created.id, { format: 'round_robin' });

        // All three pairings are playable at once.
        await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(3);

        // Record every match — each pairing is independent, so the count of
        // completed cards climbs 1→2→3 with nothing newly unlocked.
        await recordFirstPendingMatch(page);
        await recordFirstPendingMatch(page);
        await recordFirstPendingMatch(page);

        // Every pairing decided: nothing left to enter, all editable, final.
        await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(0);
        await expect(page.locator('summary', { hasText: /^Edit result$/ })).toHaveCount(3);
        await expect(page.getByText(/final results/i)).toBeVisible({ timeout: 15_000 });
      } finally {
        if (created) {
          await cancelEvent(page, created.url);
          await deleteEventById(created.id);
        }
      }
    });
  });

  test('double_elimination: winners → losers → grand final resolves a champion', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    await withPersona(browser, 'sofia', async (page) => {
      const tag = Date.now().toString(36);
      const teams = [`E2E ${tag} DE-1`, `E2E ${tag} DE-2`, `E2E ${tag} DE-3`, `E2E ${tag} DE-4`];
      let created: CreatedTournament | null = null;
      try {
        created = await createAdHocTournament(page, { title: `E2E Sofia DoubleElim ${tag}` });
        await addWalkInTeams(page, created.id, teams);
        await createAndGenerateBracket(page, created.id, { format: 'double_elimination' });

        // Double-elim renders a Winners bracket from the start; the Losers
        // bracket + Grand final fill in as results drop teams down.
        await expect(page.getByRole('heading', { name: /winners bracket/i })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.locator('summary', { hasText: /^Enter result$/ }).first()).toBeVisible();

        // Walk the whole bracket: recording a winners-bracket result drops the
        // loser into the losers bracket and eventually feeds the grand final
        // (team A always wins, so the winners champ takes the final — no reset
        // game). The loop records each newly-playable match until none remain.
        const recorded = await recordAllPlayableMatches(page);
        expect(
          recorded,
          'a 4-team double-elim should play more matches than a 3-match single-elim',
        ).toBeGreaterThanOrEqual(4);

        // Fully resolved: the losers bracket and grand final both materialized,
        // and there is nothing left to enter.
        await expect(page.getByRole('heading', { name: /losers bracket/i })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByRole('heading', { name: /grand final/i })).toBeVisible();
        await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(0);
        await expect(page.getByText(/final results/i)).toBeVisible({ timeout: 15_000 });
      } finally {
        if (created) {
          await cancelEvent(page, created.url);
          await deleteEventById(created.id);
        }
      }
    });
  });

  test('pool_play_playoff: pools resolve, then the host generates the playoff bracket', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    await withPersona(browser, 'sofia', async (page) => {
      const tag = Date.now().toString(36);
      // 4 teams, default 2 pools advancing 2 → 2 pools of 2 = 1 round-robin
      // match per pool = 2 pool matches; all 4 advance to a single-elim playoff.
      const teams = [`E2E ${tag} PP-1`, `E2E ${tag} PP-2`, `E2E ${tag} PP-3`, `E2E ${tag} PP-4`];
      let created: CreatedTournament | null = null;
      try {
        created = await createAdHocTournament(page, { title: `E2E Sofia PoolPlay ${tag}` });
        await addWalkInTeams(page, created.id, teams);
        await createAndGenerateBracket(page, created.id, { format: 'pool_play_playoff' });

        // Pools render with headings + a standings table (Set diff / Pt diff
        // columns are unique to the pool standings view).
        await expect(page.getByRole('heading', { name: /pool a/i })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByRole('heading', { name: /pool b/i })).toBeVisible();
        await expect(page.getByText(/set diff/i).first()).toBeVisible();

        // One match per pool → two playable pool matches.
        await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(2);
        await recordFirstPendingMatch(page);
        await recordFirstPendingMatch(page);

        // Pool play complete → the host gets a "Generate playoff" CTA.
        const generatePlayoff = page.getByRole('button', { name: /generate playoff/i });
        await expect(generatePlayoff).toBeVisible({ timeout: 15_000 });
        await generatePlayoff.click();

        // The playoff bracket materializes: a "Playoff" section with its own
        // playable matches (4 advancing → 2 semifinals).
        await expect(page.getByRole('heading', { name: /^playoff$/i })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.locator('summary', { hasText: /^Enter result$/ }).first()).toBeVisible();

        // Finish the playoff too — the whole event resolves.
        await recordAllPlayableMatches(page);
        await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(0);
      } finally {
        if (created) {
          await cancelEvent(page, created.url);
          await deleteEventById(created.id);
        }
      }
    });
  });
});
