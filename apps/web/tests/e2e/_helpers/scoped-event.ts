import { getCleanupClient, resolveUserIdByEmail } from './cleanup';

/**
 * Self-provisioning fixture for the visibility-scoping persona spec (Olivia,
 * P16). `friends_of_host` events have no first-class create path a single test
 * account can exercise for the *negative* case — and the discovery gate lives
 * in the `events` SELECT RLS policy
 * (`20260816000000_fix_events_select_recursion.sql`):
 *
 *   visibility = 'friends_of_host' and exists (
 *     select 1 from public.friendships f
 *      where f.user_id = events.host_id and f.friend_id = auth.uid()
 *   )
 *
 * i.e. "people the host follows" (a `friendships(user_id = host, friend_id =
 * viewer)` edge) can see the event; everyone else is hidden and the event
 * detail page `notFound()`s. So the fixture inserts a published
 * `friends_of_host` open-play event plus the single host→friend `friendships`
 * edge through the service-role admin client, then the spec drives two real
 * viewers (a friended persona = positive, an unrelated account = negative) at
 * the RLS boundary via the live `/events/[id]` page.
 *
 * Reuses the opt-in admin client from `cleanup.ts` (`E2E_CLEANUP_SUPABASE_*`);
 * when unset, `scopedEventFixtureAvailable()` is false and the spec is a
 * sanctioned infra-gated skip. Each test owns its fixture and tears it down in
 * `finally` via {@link deleteScopedEventFixture} — deleting the event, and the
 * friendship edge **only if this fixture created it** (so a pre-existing real
 * friendship is never clobbered).
 */

// Richmond convention-center point (lon, lat) — same coordinate the league
// fixture uses. `events.geo` is `geography(point,4326)`; PostgREST accepts EWKT.
const RICHMOND_GEO = 'SRID=4326;POINT(-77.4360 37.5407)';

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function token(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++)
    s += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  return s;
}

export interface ScopedEventFixture {
  eventId: string;
  hostId: string;
  friendId: string;
  /**
   * True when this fixture inserted the `friendships` edge (teardown deletes
   * it). False when the edge already existed — teardown leaves it untouched so
   * a real friendship is never removed.
   */
  createdFriendship: boolean;
}

/**
 * True when the scoped-event fixture can be provisioned — i.e. the opt-in admin
 * client is configured (`E2E_CLEANUP_SUPABASE_*`). The spec `test.skip`s on
 * false: there is no UI path to stand up a `friends_of_host` event AND its
 * host→viewer friendship for the negative case, so without service-role access
 * there is no honest way to exercise the RLS gate.
 */
export function scopedEventFixtureAvailable(): boolean {
  return getCleanupClient() !== null;
}

/**
 * Provision a published `friends_of_host` open-play event hosted by `hostEmail`,
 * with a single host→`friendEmail` `friendships` edge so that account (and only
 * accounts the host has friended) can discover it. Caller owns cleanup — always
 * pair with {@link deleteScopedEventFixture} in `finally`.
 */
export async function createFriendsOfHostEvent(opts: {
  title: string;
  hostEmail: string;
  friendEmail: string;
}): Promise<ScopedEventFixture> {
  const admin = getCleanupClient();
  if (!admin) {
    throw new Error(
      'createFriendsOfHostEvent: admin client unavailable — set E2E_CLEANUP_SUPABASE_URL / _SECRET_KEY.',
    );
  }
  const hostId = await resolveUserIdByEmail(opts.hostEmail);
  const friendId = await resolveUserIdByEmail(opts.friendEmail);
  if (hostId === friendId) {
    throw new Error('createFriendsOfHostEvent: host and friend must be different accounts.');
  }

  // Host → friend edge. Insert only if absent so teardown never deletes a
  // pre-existing real friendship.
  const { data: existing } = await admin
    .from('friendships')
    .select('user_id')
    .eq('user_id', hostId)
    .eq('friend_id', friendId)
    .maybeSingle();
  const createdFriendship = !existing;
  if (createdFriendship) {
    const { error } = await admin
      .from('friendships')
      .insert({ user_id: hostId, friend_id: friendId });
    if (error) throw new Error(`scoped-event fixture: friendship insert failed — ${error.message}`);
  }

  const now = Date.now();
  try {
    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        host_id: hostId,
        title: opts.title,
        description:
          'E2E friends-of-host visibility fixture — provisioned by tests/e2e/_helpers/scoped-event.ts. Safe to delete.',
        surface: 'indoor',
        type: 'open_play',
        visibility: 'friends_of_host',
        status: 'published',
        address_line: '500 E Marshall St',
        city: 'Richmond',
        region: 'VA',
        postal_code: '23219',
        country: 'US',
        geo: RICHMOND_GEO,
        starts_at: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
        ends_at: new Date(now + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
        short_code: `E2V${token(3)}`,
        time_zone: 'America/New_York',
      })
      .select('id')
      .single();
    if (evErr || !ev)
      throw new Error(`scoped-event fixture: event insert failed — ${evErr?.message}`);
    return { eventId: ev.id, hostId, friendId, createdFriendship };
  } catch (err) {
    // Roll back the friendship if we created it before the event insert failed.
    if (createdFriendship) {
      await admin.from('friendships').delete().eq('user_id', hostId).eq('friend_id', friendId);
    }
    throw err;
  }
}

/**
 * Tear down a fixture from {@link createFriendsOfHostEvent}: delete the event,
 * and delete the friendship edge only if this fixture created it. Safe to call
 * with `null` and when cleanup is disabled (both no-op).
 */
export async function deleteScopedEventFixture(fx: ScopedEventFixture | null): Promise<void> {
  if (!fx) return;
  const admin = getCleanupClient();
  if (!admin) return;
  await admin.from('events').delete().eq('id', fx.eventId);
  if (fx.createdFriendship) {
    await admin.from('friendships').delete().eq('user_id', fx.hostId).eq('friend_id', fx.friendId);
  }
}
