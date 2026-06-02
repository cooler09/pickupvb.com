import { test, expect } from './_helpers/fixtures';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { withAuthContext } from './_helpers/browser';
import { cancelEvent } from './_helpers/event-create';
import { deleteEventById } from './_helpers/cleanup';
import {
  addWalkInTeam,
  createAdHocTournament,
  createAndGenerateBracket,
  createBracketToDraft,
  recordFirstPendingMatch,
  resetFirstCompletedMatch,
  type CreatedTournament,
} from './_helpers/tournament';

/**
 * Bracket flows — the deep, mutating coverage Phase 1 of the e2e coverage
 * audit (C3) calls for. The persistent `E2ETFR` seed stays read-only in
 * tournament.authed.spec.ts; every test here **self-provisions** a disposable
 * ad-hoc tournament (host = the default per-worker attendee-a), drives the
 * bracket entirely through the host-only walk-in escape hatch, and tears the
 * event down in `finally`.
 *
 * Why walk-in teams: `addAdHocTeamFromForm` lets one host register teams
 * directly into a division's bracket, so the whole create → seed → generate →
 * record → advance pipeline runs with a single account — no second actor, no
 * Stripe. See tests/e2e/_helpers/tournament.ts.
 *
 * Cleanup hard-deletes the event by id (opt-in via E2E_CLEANUP_SUPABASE_*);
 * `cancelEvent` is the belt-and-suspenders UI fallback when cleanup creds
 * aren't set.
 */

test.describe('bracket — result advances the winner (C3)', () => {
  test('recording a semifinal advances exactly that match’s winner into the final', async ({
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
    let created: CreatedTournament | null = null;

    try {
      created = await createAdHocTournament(page, { title: `E2E Bracket Advance ${tag}` });

      // Register four walk-in teams → 2 semifinals + a (TBD) final.
      for (let i = 0; i < teams.length; i++) {
        await addWalkInTeam(page, created.id, teams[i]!, i + 1);
      }

      await createAndGenerateBracket(page, created.id);

      // Single-elim of 4 → exactly two playable round-1 matches; the final's
      // two slots are still TBD (no "Enter result" form there).
      await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(2);

      // Before recording: each team sits in exactly one match card.
      const before = await Promise.all(
        teams.map((t) => page.getByText(t, { exact: true }).count()),
      );
      expect(before, 'each of the 4 teams should appear in exactly one R1 match').toEqual([
        1, 1, 1, 1,
      ]);

      // Record one semifinal (team A — the top row — wins 25–10).
      await recordFirstPendingMatch(page);

      // After recording: the winner now appears in TWO cards (its completed
      // semifinal AND the final it advanced into); everyone else still once.
      // Asserting "exactly one team appears twice" is the advancement signal
      // and is independent of which specific team won.
      const after = await Promise.all(teams.map((t) => page.getByText(t, { exact: true }).count()));
      expect(
        after.filter((c) => c === 2),
        'exactly one team should have advanced into the final (appears in 2 cards)',
      ).toHaveLength(1);
      expect(
        after.filter((c) => c === 1),
        'the other three teams should each still appear once',
      ).toHaveLength(3);

      // And one of the two round-1 matches is now resolved.
      await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(1);
      await expect(page.locator('summary', { hasText: /^Edit result$/ })).toHaveCount(1);
    } finally {
      if (created) {
        await cancelEvent(page, created.url);
        await deleteEventById(created.id);
      }
    }
  });
});

test.describe('bracket — draft stage hides from spectators until published (ADR 0032)', () => {
  test('generate lands in an editable draft; publishing makes scoring live', async ({ page }) => {
    test.setTimeout(180_000);

    const tag = Date.now().toString(36);
    const teams = [`E2E ${tag} Uno`, `E2E ${tag} Dos`, `E2E ${tag} Tres`, `E2E ${tag} Quatro`];
    let created: CreatedTournament | null = null;

    try {
      created = await createAdHocTournament(page, { title: `E2E Bracket Draft ${tag}` });
      for (let i = 0; i < teams.length; i++) {
        await addWalkInTeam(page, created.id, teams[i]!, i + 1);
      }

      await createBracketToDraft(page, created.id);

      // Draft: the workspace is up (Publish CTA) but scoring isn't live yet —
      // no "Enter result" forms exist until the host publishes. The generated
      // matchups are visible in the draft for editing.
      await expect(page.getByRole('button', { name: /publish bracket/i })).toBeVisible();
      await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(0);
      await expect(page.getByText(teams[0]!, { exact: true }).first()).toBeVisible();

      // Spectators must not see a half-built draft — the public watch view says
      // it's being finalized and renders no scoring board.
      await page.goto(`/events/${created.id}/bracket/watch`);
      await expect(page.getByText(/finalizing the bracket/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(0);

      // Back on the host workspace → Publish → scoring goes live.
      await page.goto(`/events/${created.id}/bracket`);
      await page.getByRole('button', { name: /publish bracket/i }).click();
      await expect(page.locator('summary', { hasText: /^Enter result$/ }).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      if (created) {
        await cancelEvent(page, created.url);
        await deleteEventById(created.id);
      }
    }
  });
});

test.describe('bracket — result entry is host/captain only (C3)', () => {
  test('a non-host, non-captain viewer sees the board read-only (no result form)', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');

    const tag = Date.now().toString(36);
    const teams = [`E2E ${tag} Home`, `E2E ${tag} Away`];
    let created: CreatedTournament | null = null;

    try {
      // Host (attendee-a) provisions a 2-team bracket → one playable final.
      created = await createAdHocTournament(page, { title: `E2E Bracket Authz ${tag}` });
      for (let i = 0; i < teams.length; i++) {
        await addWalkInTeam(page, created.id, teams[i]!, i + 1);
      }
      await createAndGenerateBracket(page, created.id);

      // Host sees exactly one result-entry form (they own the walk-in teams).
      await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(1);

      // attendee-b is neither the event host/co-host nor a captain of either
      // walk-in team (both are captained by the host). They may VIEW the
      // public bracket but must not get any result-entry affordance.
      await withAuthContext(browser, STORAGE_PATHS.attendeeB, async (bPage) => {
        await bPage.goto(`/events/${created!.id}/bracket`);

        // Board renders for the viewer — both team names are visible.
        await expect(bPage.getByText(teams[0]!, { exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(bPage.getByText(teams[1]!, { exact: true })).toBeVisible();

        // …but no result-entry UI: no Enter/Edit summary, no score inputs.
        await expect(bPage.locator('summary', { hasText: /^(Enter|Edit) result$/ })).toHaveCount(0);
        await expect(bPage.locator('input[name="set_a_1"]')).toHaveCount(0);
      });
    } finally {
      if (created) {
        await cancelEvent(page, created.url);
        await deleteEventById(created.id);
      }
    }
  });
});

test.describe('bracket — record all matches resolves a champion (C3)', () => {
  test('recording every match completes the bracket and crowns a champion', async ({ page }) => {
    test.setTimeout(180_000);

    const tag = Date.now().toString(36);
    const teams = [`E2E ${tag} North`, `E2E ${tag} South`, `E2E ${tag} East`, `E2E ${tag} West`];
    let created: CreatedTournament | null = null;

    try {
      created = await createAdHocTournament(page, { title: `E2E Bracket Champion ${tag}` });
      for (let i = 0; i < teams.length; i++) {
        await addWalkInTeam(page, created.id, teams[i]!, i + 1);
      }
      await createAndGenerateBracket(page, created.id);

      // 4-team single-elim = 2 semifinals + 1 final. Record the two semis…
      await recordFirstPendingMatch(page);
      await recordFirstPendingMatch(page);
      // …then the now-playable final.
      await recordFirstPendingMatch(page);

      // Bracket fully resolved. The board surfaces a finished bracket through
      // the "Final results" header and a fully-played match tree — there is NO
      // separate champion banner in the board UI; the champion's name is
      // rendered only on the public spectator OG image (bracket/watch/_og.tsx
      // #pickChampion). "Champion crowned" therefore == the final round is
      // decided: status completed, nothing left to enter, every match editable.
      await expect(page.getByText(/final results/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(0);
      await expect(page.locator('summary', { hasText: /^Edit result$/ })).toHaveCount(3);
      // Round 2 of a 4-team single-elim IS the final; its column renders once
      // the semis feed into it, confirming the tree played all the way through.
      await expect(page.getByRole('heading', { name: /^Round 2$/ })).toBeVisible();
    } finally {
      if (created) {
        await cancelEvent(page, created.url);
        await deleteEventById(created.id);
      }
    }
  });
});

test.describe('bracket — resetting a match reverts it and clears downstream (C3)', () => {
  test('clearing a recorded semifinal reverts it to unplayed and pulls the advanced team back out of the final', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const tag = Date.now().toString(36);
    const teams = [`E2E ${tag} Red`, `E2E ${tag} Blue`, `E2E ${tag} Green`, `E2E ${tag} Gold`];
    let created: CreatedTournament | null = null;

    try {
      created = await createAdHocTournament(page, { title: `E2E Bracket Reset ${tag}` });
      for (let i = 0; i < teams.length; i++) {
        await addWalkInTeam(page, created.id, teams[i]!, i + 1);
      }
      await createAndGenerateBracket(page, created.id);

      // Record one semifinal → its winner advances into the final.
      await recordFirstPendingMatch(page);
      const advanced = await Promise.all(
        teams.map((t) => page.getByText(t, { exact: true }).count()),
      );
      expect(
        advanced.filter((c) => c === 2),
        'one team should have advanced into the final before the reset',
      ).toHaveLength(1);
      await expect(page.locator('summary', { hasText: /^Edit result$/ })).toHaveCount(1);

      // Clear that completed match.
      await resetFirstCompletedMatch(page);

      // Match reverts to unplayed: no completed matches remain, and both
      // semifinals are playable again.
      await expect(page.locator('summary', { hasText: /^Edit result$/ })).toHaveCount(0);
      await expect(page.locator('summary', { hasText: /^Enter result$/ })).toHaveCount(2);

      // Downstream cleared: the advanced team is pulled back out of the final,
      // so no team sits in two cards anymore — each of the four appears once.
      const afterReset = await Promise.all(
        teams.map((t) => page.getByText(t, { exact: true }).count()),
      );
      expect(
        afterReset.filter((c) => c === 2),
        'no team should remain advanced after the reset',
      ).toHaveLength(0);
      expect(
        afterReset.every((c) => c === 1),
        'every team should appear exactly once',
      ).toBe(true);
    } finally {
      if (created) {
        await cancelEvent(page, created.url);
        await deleteEventById(created.id);
      }
    }
  });
});
