import { test, expect, type Page } from './_helpers/fixtures';
import { PERSONAS, withPersona, skipIfPersonaMissing } from './_helpers/personas';
import { isVisibleOrTimeout } from './_helpers/predicates';
import {
  createPositionalEvent,
  deletePositionalEvent,
  positionalEventFixtureAvailable,
  type PositionalEventFixture,
} from './_helpers/positional-event';

/**
 * Priya Nair (P12) — the positional player (libero). docs/personas.md.
 *
 * Priya cares which positions are filled before she commits. Her profile
 * position fields are runnable to assert; the positional RSVP + over-fill→
 * waitlist flow self-provisions a `by_position` open play through the admin
 * client (`_helpers/positional-event.ts`, the `events.position_roster` jsonb)
 * and drives the real `PositionRsvpPanel`. The over-fill is the genuine
 * "waitlist" in this app — a position past its target accepts the join but
 * flags it "Waitlist" (there is no capacity waitlist queue — see Hannah's
 * spec / the waitlist-not-implemented note).
 */

const priya = PERSONAS.priya;

/**
 * Click a position row's "Join" / "Join waitlist" button and confirm in the
 * in-app `<dialog>` (a `ConfirmSubmitButton` whose confirm shares the label).
 */
async function joinPosition(
  page: Page,
  row: ReturnType<Page['locator']>,
  label: RegExp,
): Promise<void> {
  await row.getByRole('button', { name: label }).click();
  await page.locator('dialog[open]').getByRole('button', { name: label }).click();
  await page.waitForLoadState('domcontentloaded');
}

test.describe(`${priya.name} (${priya.id}) — positional player`, () => {
  test('/profile exposes the primary/secondary/tertiary position fields', async ({ browser }) => {
    await withPersona(browser, 'priya', async (page) => {
      await page.goto('/profile');
      await page.waitForLoadState('domcontentloaded');
      // Expand the edit form if it's behind a <summary>.
      const editSummary = page
        .locator('details summary')
        .filter({ hasText: /edit profile/i })
        .first();
      if (await isVisibleOrTimeout(editSummary, 3_000)) await editSummary.click();

      const hasPositionField = await isVisibleOrTimeout(
        page
          .locator('select[name*="position"], input[name*="position"], [name="primary_position"]')
          .or(page.getByText(/setter|outside|opposite|middle|libero|defensive/i))
          .first(),
        5_000,
      );
      expect(hasPositionField).toBe(true);
    });
  });

  test('discovers events (positional or otherwise)', async ({ browser }) => {
    await withPersona(browser, 'priya', async (page) => {
      const res = await page.goto('/events');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  test('RSVPs into the libero slot of a positional open play', async ({ browser }) => {
    test.skip(
      !positionalEventFixtureAvailable(),
      'positional fixture needs E2E_CLEANUP_SUPABASE_* (the by-position roster is admin-provisioned)',
    );
    skipIfPersonaMissing('priya');
    const hostEmail = process.env['TEST_FREE_HOST_EMAIL'];
    if (!hostEmail) test.skip(true, 'needs TEST_FREE_HOST_EMAIL (the positional event host)');
    test.setTimeout(120_000);

    let fx: PositionalEventFixture | null = null;
    try {
      fx = await createPositionalEvent({
        title: `E2E Priya Positional ${Date.now()}`,
        hostEmail: hostEmail!,
        positionRoster: { libero: 1, setter: 2 },
      });

      await withPersona(browser, 'priya', async (page) => {
        await page.goto(`/events/${fx!.eventId}`);
        await page.waitForLoadState('domcontentloaded');

        // The libero slot is empty (0/1) → a plain "Join", no Waitlist badge.
        const liberoRow = page
          .locator('li')
          .filter({ hasText: /libero/i })
          .first();
        await expect(liberoRow).toBeVisible({ timeout: 10_000 });
        await expect(liberoRow).toContainText('0/1');
        await expect(liberoRow.getByText('Waitlist', { exact: true })).toHaveCount(0);

        await joinPosition(page, liberoRow, /^join$/i);

        // She's now signed up at her position.
        await expect(page.getByText(/you're signed up as libero/i)).toBeVisible({
          timeout: 10_000,
        });
      });
    } finally {
      await deletePositionalEvent(fx);
    }
  });

  test('sees the position roster and the over-fill → waitlist behaviour', async ({
    page,
    browser,
  }) => {
    test.skip(
      !positionalEventFixtureAvailable(),
      'positional fixture needs E2E_CLEANUP_SUPABASE_* (the by-position roster is admin-provisioned)',
    );
    skipIfPersonaMissing('priya');
    const hostEmail = process.env['TEST_FREE_HOST_EMAIL'];
    if (!hostEmail) test.skip(true, 'needs TEST_FREE_HOST_EMAIL (the positional event host)');
    test.setTimeout(120_000);

    let fx: PositionalEventFixture | null = null;
    try {
      // One libero slot. attendee-a (the per-worker default `page`) fills it.
      fx = await createPositionalEvent({
        title: `E2E Priya Overfill ${Date.now()}`,
        hostEmail: hostEmail!,
        positionRoster: { libero: 1 },
      });

      await page.goto(`/events/${fx.eventId}`);
      await page.waitForLoadState('domcontentloaded');
      const aLibero = page
        .locator('li')
        .filter({ hasText: /libero/i })
        .first();
      await joinPosition(page, aLibero, /^join$/i);
      await expect(page.getByText(/you're signed up as libero/i)).toBeVisible({ timeout: 10_000 });

      // Priya now sees libero as full (1/1) → a "Waitlist" badge + "Join waitlist".
      await withPersona(browser, 'priya', async (pPage) => {
        await pPage.goto(`/events/${fx!.eventId}`);
        await pPage.waitForLoadState('domcontentloaded');
        const liberoRow = pPage
          .locator('li')
          .filter({ hasText: /libero/i })
          .first();
        await expect(liberoRow).toContainText('1/1');
        await expect(liberoRow.getByText('Waitlist', { exact: true })).toBeVisible({
          timeout: 10_000,
        });

        // Over-fill is allowed: the waitlist join still goes through.
        await joinPosition(pPage, liberoRow, /join waitlist/i);
        await expect(pPage.getByText(/you're signed up as libero/i)).toBeVisible({
          timeout: 10_000,
        });
      });
    } finally {
      await deletePositionalEvent(fx);
    }
  });
});
