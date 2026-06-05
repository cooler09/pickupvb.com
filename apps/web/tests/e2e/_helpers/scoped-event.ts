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

// ── friends_of_attendees ──────────────────────────────────────────────────
//
// The sibling visibility branch: a `friends_of_attendees` event is discoverable
// by a viewer who is friends with one of its *attendees* (not the host). The
// `events` SELECT RLS delegates this branch to the SECURITY DEFINER helper
// `event_has_attendee_friend(event_id)` (20260816000000_fix_events_select_
// recursion.sql), which is true iff:
//
//   exists (select 1
//             from event_participants p
//             join event_divisions d on d.id = p.division_id
//             join friendships f on f.user_id = p.user_id and f.friend_id = auth.uid()
//            where d.event_id = <event> and p.role = 'attendee')
//
// So the fixture needs THREE distinct accounts — host, attendee, viewer — plus
// one division (the helper joins through `event_divisions`), one
// `event_participants` row (role `attendee`), and the directed `attendee →
// viewer` friendship the gate keys on. Unlike the host branch, the friendship is
// rooted at the *attendee*, so the negative viewer just needs no such edge from
// the attendee. Composition of the division is irrelevant to the gate, so it's a
// plain solo open-play division.

export interface AttendeeScopedEventFixture {
  eventId: string;
  hostId: string;
  attendeeId: string;
  friendId: string;
  /**
   * True when this fixture inserted the `attendee → friend` edge (teardown
   * deletes it). False when the edge already existed — teardown leaves it.
   */
  createdFriendship: boolean;
}

/**
 * Provision a published `friends_of_attendees` open-play event hosted by
 * `hostEmail`, with `attendeeEmail` rostered as an attendee and a single
 * `attendee → friendEmail` `friendships` edge so that account (and only accounts
 * friended by an attendee) can discover it. Host, attendee, and friend must be
 * three different accounts. Caller owns cleanup — always pair with
 * {@link deleteFriendsOfAttendeesFixture} in `finally`.
 */
export async function createFriendsOfAttendeesEvent(opts: {
  title: string;
  hostEmail: string;
  attendeeEmail: string;
  friendEmail: string;
}): Promise<AttendeeScopedEventFixture> {
  const admin = getCleanupClient();
  if (!admin) {
    throw new Error(
      'createFriendsOfAttendeesEvent: admin client unavailable — set E2E_CLEANUP_SUPABASE_URL / _SECRET_KEY.',
    );
  }
  const hostId = await resolveUserIdByEmail(opts.hostEmail);
  const attendeeId = await resolveUserIdByEmail(opts.attendeeEmail);
  const friendId = await resolveUserIdByEmail(opts.friendEmail);
  if (new Set([hostId, attendeeId, friendId]).size !== 3) {
    throw new Error(
      'createFriendsOfAttendeesEvent: host, attendee, and friend must be three different accounts.',
    );
  }

  // Attendee → friend edge — the edge the RLS gate keys on. Insert only if
  // absent so teardown never deletes a pre-existing real friendship.
  const { data: existing } = await admin
    .from('friendships')
    .select('user_id')
    .eq('user_id', attendeeId)
    .eq('friend_id', friendId)
    .maybeSingle();
  const createdFriendship = !existing;
  if (createdFriendship) {
    const { error } = await admin
      .from('friendships')
      .insert({ user_id: attendeeId, friend_id: friendId });
    if (error)
      throw new Error(`friends-of-attendees fixture: friendship insert failed — ${error.message}`);
  }

  const now = Date.now();
  let eventId: string | null = null;
  try {
    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        host_id: hostId,
        title: opts.title,
        description:
          'E2E friends-of-attendees visibility fixture — provisioned by tests/e2e/_helpers/scoped-event.ts. Safe to delete.',
        surface: 'indoor',
        type: 'open_play',
        visibility: 'friends_of_attendees',
        status: 'published',
        address_line: '500 E Marshall St',
        city: 'Richmond',
        region: 'VA',
        postal_code: '23219',
        country: 'US',
        geo: RICHMOND_GEO,
        starts_at: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
        ends_at: new Date(now + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
        short_code: `E2A${token(3)}`,
        time_zone: 'America/New_York',
      })
      .select('id')
      .single();
    if (evErr || !ev)
      throw new Error(`friends-of-attendees fixture: event insert failed — ${evErr?.message}`);
    eventId = ev.id;

    // One solo open-play division so the participant has a `division_id` to
    // attach to (the gate joins event_participants → event_divisions).
    const { data: div, error: divErr } = await admin
      .from('event_divisions')
      .insert({
        event_id: eventId,
        sort_order: 0,
        label: 'Open',
        surface: 'indoor',
        format: 'sixes',
        gender: 'coed',
        skill_tier: 'bb',
        team_composition: 'solo',
        capacity_kind: 'unlimited',
      })
      .select('id')
      .single();
    if (divErr || !div)
      throw new Error(`friends-of-attendees fixture: division insert failed — ${divErr?.message}`);

    // The attendee the viewer is friends with — role must be 'attendee' (the
    // gate filters on it).
    const { error: partErr } = await admin
      .from('event_participants')
      .insert({ division_id: div.id, user_id: attendeeId, role: 'attendee' });
    if (partErr)
      throw new Error(
        `friends-of-attendees fixture: participant insert failed — ${partErr.message}`,
      );

    return { eventId, hostId, attendeeId, friendId, createdFriendship };
  } catch (err) {
    // Roll back whatever landed: deleting the event CASCADEs the division +
    // participant; the friendship is independent.
    if (eventId) await admin.from('events').delete().eq('id', eventId);
    if (createdFriendship) {
      await admin.from('friendships').delete().eq('user_id', attendeeId).eq('friend_id', friendId);
    }
    throw err;
  }
}

/**
 * Tear down a fixture from {@link createFriendsOfAttendeesEvent}: delete the
 * event (CASCADEs the division + attendee participant), and delete the
 * friendship edge only if this fixture created it. Safe with `null` / cleanup
 * disabled (both no-op).
 */
export async function deleteFriendsOfAttendeesFixture(
  fx: AttendeeScopedEventFixture | null,
): Promise<void> {
  if (!fx) return;
  const admin = getCleanupClient();
  if (!admin) return;
  await admin.from('events').delete().eq('id', fx.eventId);
  if (fx.createdFriendship) {
    await admin
      .from('friendships')
      .delete()
      .eq('user_id', fx.attendeeId)
      .eq('friend_id', fx.friendId);
  }
}
