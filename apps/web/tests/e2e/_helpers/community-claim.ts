import { getCleanupClient, resolveUserIdByEmail } from './cleanup';

/**
 * Self-provisioning fixture for the community-listing **claim → approve** flow
 * (Zoe P18 — e2e audit Tier D). The claim is gated three ways that the UI alone
 * can't satisfy with a throwaway listing:
 *
 *   1. `ClaimCommunityListingHandler` requires the claimant to **host** the
 *      linked event, and
 *   2. `matchesByDateAndCity` requires that event to start on the **same
 *      calendar day** AND share the **same city** as the listing — a UI
 *      throwaway listing (`_helpers/community.ts`) has no city, so it can never
 *      be claimed.
 *   3. The page only renders the claim form when the viewer is **not** the
 *      submitter and **not** an admin (`showClaimSection`).
 *
 * So this fixture admin-provisions BOTH a city-bearing `active` listing (with a
 * **different** submitter so the claimant sees the claim form) and a matching
 * published event hosted by the claimant, with identical `starts_at` + city so
 * the match passes. The spec then drives the real UI: the claimant files the
 * claim, a platform admin (Zoe) approves it.
 *
 * Reuses the opt-in admin client from `cleanup.ts` (`E2E_CLEANUP_SUPABASE_*`);
 * when unset `claimableListingFixtureAvailable()` is false and the spec is a
 * sanctioned infra-gated skip. Each test owns its fixture and tears it down in
 * `finally` via {@link deleteClaimableListingFixture}.
 */

const RICHMOND_GEO = 'SRID=4326;POINT(-77.4360 37.5407)';

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function token(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++)
    s += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  return s;
}

export interface ClaimableListingFixture {
  listingId: string;
  listingSlug: string;
  /** `/community/<slug>` detail URL. */
  listingUrl: string;
  eventId: string;
  claimantId: string;
}

/**
 * True when the fixture can be provisioned — the opt-in admin client is
 * configured and both emails are known (and differ).
 */
export function claimableListingFixtureAvailable(
  claimantEmail: string | undefined,
  submitterEmail: string | undefined,
): boolean {
  return getCleanupClient() !== null && !!claimantEmail && !!submitterEmail;
}

/**
 * Provision an `active` community listing (submitted by `submitterEmail`) plus a
 * matching published event hosted by `claimantEmail` — same city, same calendar
 * day — so the claimant can claim the listing through the UI. Submitter and
 * claimant must differ (the claim form hides for the submitter). Caller owns
 * cleanup — always pair with {@link deleteClaimableListingFixture} in `finally`.
 */
export async function createClaimableListingFixture(opts: {
  title: string;
  submitterEmail: string;
  claimantEmail: string;
  city?: string;
}): Promise<ClaimableListingFixture> {
  const admin = getCleanupClient();
  if (!admin) {
    throw new Error(
      'createClaimableListingFixture: admin client unavailable — set E2E_CLEANUP_SUPABASE_URL / _SECRET_KEY.',
    );
  }
  const submitterId = await resolveUserIdByEmail(opts.submitterEmail);
  const claimantId = await resolveUserIdByEmail(opts.claimantEmail);
  if (submitterId === claimantId) {
    throw new Error(
      'createClaimableListingFixture: submitter and claimant must differ (the claim form hides for the submitter).',
    );
  }
  const city = opts.city ?? 'Richmond';

  // A well-defined future instant; both rows share it, so they are trivially the
  // same calendar day in any timezone (avoids a midnight-boundary flake).
  const startsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  startsAt.setUTCHours(17, 0, 0, 0);
  const startsAtIso = startsAt.toISOString();
  const endsAtIso = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000).toISOString();

  let listingId: string | null = null;
  let eventId: string | null = null;
  try {
    const { data: listing, error: lErr } = await admin
      .from('community_listings')
      .insert({
        title: opts.title,
        description: 'E2E claimable-listing fixture — safe to delete.',
        external_url: 'https://www.facebook.com/groups/vbtest',
        external_host_name: 'E2E Test Club',
        submitter_user_id: submitterId,
        city,
        region: 'VA',
        country: 'US',
        starts_at: startsAtIso,
        time_zone: 'America/New_York',
        status: 'active',
        slug: `e2e-claim-${token(8).toLowerCase()}`,
      })
      .select('id, slug')
      .single();
    if (lErr || !listing)
      throw new Error(`claimable-listing fixture listing insert failed: ${lErr?.message}`);
    listingId = listing.id;

    const { data: ev, error: eErr } = await admin
      .from('events')
      .insert({
        host_id: claimantId,
        title: `${opts.title} (event)`,
        description:
          'E2E claimable-listing fixture event — provisioned by tests/e2e/_helpers/community-claim.ts. Safe to delete.',
        surface: 'indoor',
        type: 'open_play',
        visibility: 'public',
        status: 'published',
        address_line: '500 E Marshall St',
        city,
        region: 'VA',
        postal_code: '23219',
        country: 'US',
        geo: RICHMOND_GEO,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        short_code: `E2C${token(3)}`,
        time_zone: 'America/New_York',
      })
      .select('id')
      .single();
    if (eErr || !ev)
      throw new Error(`claimable-listing fixture event insert failed: ${eErr?.message}`);
    eventId = ev.id;

    return {
      listingId,
      listingSlug: listing.slug ?? listingId,
      listingUrl: `/community/${listing.slug ?? listingId}`,
      eventId: ev.id,
      claimantId,
    };
  } catch (err) {
    if (eventId) await admin.from('events').delete().eq('id', eventId);
    if (listingId) await admin.from('community_listings').delete().eq('id', listingId);
    throw err;
  }
}

/**
 * Tear down a fixture from {@link createClaimableListingFixture}: delete the
 * event and the listing. Safe with `null` / cleanup disabled (both no-op).
 */
export async function deleteClaimableListingFixture(
  fx: ClaimableListingFixture | null,
): Promise<void> {
  if (!fx) return;
  const admin = getCleanupClient();
  if (!admin) return;
  await admin.from('events').delete().eq('id', fx.eventId);
  await admin.from('community_listings').delete().eq('id', fx.listingId);
}
