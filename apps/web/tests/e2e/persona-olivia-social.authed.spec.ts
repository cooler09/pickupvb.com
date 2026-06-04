import { test, expect } from './_helpers/fixtures';
import { PERSONAS, withPersona, personaEmail, skipIfPersonaMissing } from './_helpers/personas';
import { skipIfMissingAuth } from './_helpers/auth';
import { STORAGE_PATHS } from './_helpers/paths';
import { withAuthContext } from './_helpers/browser';
import {
  createFriendsOfHostEvent,
  deleteScopedEventFixture,
  scopedEventFixtureAvailable,
  type ScopedEventFixture,
} from './_helpers/scoped-event';

/**
 * Olivia Banks (P16) — the social connector / visibility-scoping hub.
 * docs/personas.md.
 *
 * "Friends" in this app are the directed `friendships` table written by
 * `addFriend` / `removeFriend` (the "+ Follow" / "✓ Following" buttons). Olivia
 * is the linchpin for visibility scoping: a `friends_of_host` event is gated by
 * the `events` SELECT RLS policy on `friendships(user_id = host, friend_id =
 * viewer)` — "people the host follows" can see it, everyone else gets a
 * `notFound()`. The scoping test self-provisions that exact shape through the
 * admin client (`_helpers/scoped-event.ts`) and drives both sides of the RLS
 * gate with real viewers.
 */

const olivia = PERSONAS.olivia;

test.describe(`${olivia.name} (${olivia.id}) — social connector`, () => {
  test('/friends loads without error', async ({ browser }) => {
    await withPersona(browser, 'olivia', async (page) => {
      const res = await page.goto('/friends');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('body')).not.toContainText(/500|internal server error/i);
    });
  });

  test('/players directory loads', async ({ browser }) => {
    await withPersona(browser, 'olivia', async (page) => {
      const res = await page.goto('/players');
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 });
    });
  });

  test('follows then unfollows a player, and cannot friend herself', async ({ browser }) => {
    skipIfPersonaMissing('olivia');
    test.setTimeout(90_000);
    await withPersona(browser, 'olivia', async (page) => {
      // Own handle + own public-profile URL, so we skip self in the directory
      // and assert the self-friend invariant on her own player page.
      await page.goto('/profile');
      await page.waitForLoadState('domcontentloaded');
      const handleInput = page.locator('input[name="handle"]').first();
      const ownHandle = (await handleInput.count()) > 0 ? await handleInput.inputValue() : null;
      const ownPlayerHref = await page
        .locator('a[href*="/players/"]')
        .first()
        .getAttribute('href')
        .catch(() => null);

      // Self-friend invariant: there is no follow/friend affordance on her own
      // public profile (the directed `friendships` row has check(user_id <>
      // friend_id); the UI never offers a self-follow).
      if (ownPlayerHref) {
        await page.goto(ownPlayerHref);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.getByRole('button', { name: /\+\s*follow|^follow$/i })).toHaveCount(0);
      }

      // Find a player who is NOT Olivia to follow.
      await page.goto('/players');
      await page.waitForLoadState('domcontentloaded');
      const playerLinks = page.locator('a[href*="/players/"]');
      const linkCount = await playerLinks.count();
      let targetHref: string | null = null;
      for (let i = 0; i < linkCount; i++) {
        const href = await playerLinks.nth(i).getAttribute('href');
        if (!href) continue;
        if (ownHandle && href.includes(`/players/${ownHandle}`)) continue;
        targetHref = href;
        break;
      }
      if (!targetHref) {
        test.skip(true, 'No other players in the directory for Olivia to follow');
      }

      await page.goto(targetHref!);
      await page.waitForLoadState('domcontentloaded');
      const followBtn = page.getByRole('button', { name: /\+\s*follow|^follow$/i }).first();
      if ((await followBtn.count()) === 0) {
        test.skip(true, 'No Follow button on this player (Olivia may already follow them)');
      }

      // Add: "+ Follow" → "✓ Following".
      await followBtn.click();
      await page.waitForLoadState('domcontentloaded');
      const following = page.getByRole('button', { name: /following|unfollow/i }).first();
      await expect(following).toBeVisible({ timeout: 10_000 });

      // Remove: back to "+ Follow" (full reversal — no friendship leaks).
      await following.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('button', { name: /\+\s*follow|^follow$/i }).first()).toBeVisible(
        {
          timeout: 10_000,
        },
      );
    });
  });

  test('a friends_of_host event is visible to a friend of the host, not to an unrelated viewer', async ({
    browser,
  }) => {
    test.skip(
      !scopedEventFixtureAvailable(),
      'scoped-event fixture needs E2E_CLEANUP_SUPABASE_* (friends_of_host events + the friendship edge are admin-provisioned)',
    );
    skipIfPersonaMissing('olivia');
    skipIfMissingAuth(STORAGE_PATHS.attendeeB, 'attendee-b');
    const hostEmail = process.env['TEST_FREE_HOST_EMAIL'];
    const friendEmail = personaEmail('olivia');
    if (!hostEmail) test.skip(true, 'needs TEST_FREE_HOST_EMAIL (the friends_of_host host)');
    if (!friendEmail) test.skip(true, 'needs TEST_SOCIAL_EMAIL (Olivia, the host’s friend)');
    test.setTimeout(120_000);

    const stamp = Date.now().toString(36);
    const title = `E2E FriendsOfHost ${stamp}`;
    let fx: ScopedEventFixture | null = null;

    try {
      fx = await createFriendsOfHostEvent({
        title,
        hostEmail: hostEmail!,
        friendEmail: friendEmail!,
      });
      const stampRe = new RegExp(stamp, 'i');

      // Positive — Olivia is friended by the host, so RLS lets her open it.
      await withPersona(browser, 'olivia', async (page) => {
        const res = await page.goto(`/events/${fx!.eventId}`);
        expect(res?.ok(), 'host’s friend should be able to load the scoped event').toBeTruthy();
        await expect(page.getByText(stampRe).first()).toBeVisible({ timeout: 10_000 });
      });

      // Negative — attendee-b is not friended by the host, so RLS hides the row
      // and the event detail page notFound()s. The event title must not appear.
      await withAuthContext(browser, STORAGE_PATHS.attendeeB, async (bPage) => {
        await bPage.goto(`/events/${fx!.eventId}`);
        await bPage.waitForLoadState('domcontentloaded');
        await expect(bPage.getByText(stampRe)).toHaveCount(0);
        await expect(
          bPage.getByText(/not found|page not found|doesn’t exist|no longer available/i).first(),
        ).toBeVisible({ timeout: 10_000 });
      });
    } finally {
      await deleteScopedEventFixture(fx);
    }
  });

  // Still fixme — friends_of_attendees scoping keys the RLS gate on a friendship
  // to an *attendee* (not the host), so it needs a second seeded actor attending
  // the event plus that attendee→viewer friendship edge. Extend
  // _helpers/scoped-event.ts with an `event_attendees` insert + attendee→friend
  // edge to graduate this (mirror createFriendsOfHostEvent).
  test.fixme('finds a friends_of_attendees event when a friend is attending', async () => {});
});
