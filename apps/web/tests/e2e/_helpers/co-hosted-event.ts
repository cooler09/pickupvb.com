import { getCleanupClient, resolveUserIdByEmail } from './cleanup';

/**
 * Self-provisioning fixture for the co-host persona spec (Steve, P3). A co-host
 * is an `event_co_hosts(event_id, host_user_id)` row (no acceptance step — the
 * row alone grants the grant; `20260513000700_groups_and_co_hosts.sql`). The
 * server-rendered edit + manage pages gate on `event.canManage`, which includes
 * co-hosts ("Only hosts and co-hosts reach the dashboard"), so a co-host can be
 * provisioned purely at the data layer and then drive the real management UI.
 *
 * Provisions a published, public open play hosted by `hostEmail` (Mark) with
 * `coHostEmail` (Steve) added as a co-host, through the service-role admin
 * client — same pattern as the league / scoped-event / positional fixtures.
 * Reuses the opt-in admin client (`E2E_CLEANUP_SUPABASE_*`); when unset,
 * `coHostedEventFixtureAvailable()` is false and the spec is a sanctioned
 * infra-gated skip. Caller owns cleanup — pair with {@link deleteCoHostedEvent}
 * in `finally` (deleting the event CASCADEs its `event_co_hosts`).
 */

// Richmond convention-center point (lon, lat) — same coordinate the sibling
// admin fixtures use. `events.geo` is `geography(point,4326)` (EWKT).
const RICHMOND_GEO = 'SRID=4326;POINT(-77.4360 37.5407)';

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function token(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++)
    s += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  return s;
}

export interface CoHostedEventFixture {
  eventId: string;
  hostId: string;
  coHostId: string;
  title: string;
}

/** True when the co-hosted-event fixture can be provisioned (admin client configured). */
export function coHostedEventFixtureAvailable(): boolean {
  return getCleanupClient() !== null;
}

/**
 * Provision a published, public open play hosted by `hostEmail` with
 * `coHostEmail` added as an `event_co_hosts` co-host. Caller owns cleanup — pair
 * with {@link deleteCoHostedEvent}.
 */
export async function createCoHostedEvent(opts: {
  title: string;
  hostEmail: string;
  coHostEmail: string;
  /**
   * When set, also seed one division + one attendee (this account) so surfaces
   * that gate on attendee count render — e.g. the `HostBroadcastPanel`
   * (`attendeeCount === 0 → null`). Must differ from the host + co-host.
   */
  attendeeEmail?: string;
}): Promise<CoHostedEventFixture> {
  const admin = getCleanupClient();
  if (!admin) {
    throw new Error(
      'createCoHostedEvent: admin client unavailable — set E2E_CLEANUP_SUPABASE_URL / _SECRET_KEY.',
    );
  }
  const hostId = await resolveUserIdByEmail(opts.hostEmail);
  const coHostId = await resolveUserIdByEmail(opts.coHostEmail);
  if (hostId === coHostId) {
    throw new Error('createCoHostedEvent: host and co-host must be different accounts.');
  }
  const attendeeId = opts.attendeeEmail ? await resolveUserIdByEmail(opts.attendeeEmail) : null;
  if (attendeeId && (attendeeId === hostId || attendeeId === coHostId)) {
    throw new Error('createCoHostedEvent: attendee must differ from the host + co-host.');
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
          'E2E co-host fixture — provisioned by tests/e2e/_helpers/co-hosted-event.ts. Safe to delete.',
        surface: 'indoor',
        type: 'open_play',
        visibility: 'public',
        status: 'published',
        address_line: '500 E Marshall St',
        city: 'Richmond',
        region: 'VA',
        postal_code: '23219',
        country: 'US',
        geo: RICHMOND_GEO,
        starts_at: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
        ends_at: new Date(now + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
        short_code: `E2C${token(3)}`,
        time_zone: 'America/New_York',
      })
      .select('id')
      .single();
    if (evErr || !ev) throw new Error(`co-host fixture event insert failed: ${evErr?.message}`);
    eventId = ev.id;

    const { error: chErr } = await admin
      .from('event_co_hosts')
      .insert({ event_id: eventId, host_user_id: coHostId, added_by: hostId });
    if (chErr) throw new Error(`co-host fixture event_co_hosts insert failed: ${chErr.message}`);

    if (attendeeId) {
      // One solo division + one attendee so `attendeeCount > 0` and the
      // HostBroadcastPanel renders.
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
        throw new Error(`co-host fixture division insert failed: ${divErr?.message}`);
      const { error: partErr } = await admin
        .from('event_participants')
        .insert({ division_id: div.id, user_id: attendeeId, role: 'attendee' });
      if (partErr) throw new Error(`co-host fixture attendee insert failed: ${partErr.message}`);
    }

    return { eventId, hostId, coHostId, title: opts.title };
  } catch (err) {
    if (eventId) await admin.from('events').delete().eq('id', eventId);
    throw err;
  }
}

/**
 * Tear down a fixture from {@link createCoHostedEvent}: delete the event
 * (CASCADEs `event_co_hosts`, divisions, participants). Safe with `null` and
 * when cleanup is disabled.
 */
export async function deleteCoHostedEvent(fx: CoHostedEventFixture | null): Promise<void> {
  if (!fx) return;
  const admin = getCleanupClient();
  if (!admin) return;
  await admin.from('events').delete().eq('id', fx.eventId);
}

/**
 * True when an `event_attendees` broadcast row exists for `eventId` sent by
 * `senderId`. Used to assert that a co-host's broadcast INSERT was allowed by
 * the `broadcasts_insert_event_host` policy (the row only lands if RLS passed).
 */
export async function eventBroadcastBySenderExists(
  eventId: string,
  senderId: string,
): Promise<boolean> {
  const admin = getCleanupClient();
  if (!admin) return false;
  const { data } = await admin
    .from('broadcasts')
    .select('id')
    .eq('audience_type', 'event_attendees')
    .eq('audience_id', eventId)
    .eq('sender_id', senderId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
