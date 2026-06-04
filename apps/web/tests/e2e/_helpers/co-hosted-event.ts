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

    return { eventId, hostId, coHostId, title: opts.title };
  } catch (err) {
    if (eventId) await admin.from('events').delete().eq('id', eventId);
    throw err;
  }
}

/**
 * Tear down a fixture from {@link createCoHostedEvent}: delete the event
 * (CASCADEs `event_co_hosts`). Safe with `null` and when cleanup is disabled.
 */
export async function deleteCoHostedEvent(fx: CoHostedEventFixture | null): Promise<void> {
  if (!fx) return;
  const admin = getCleanupClient();
  if (!admin) return;
  await admin.from('events').delete().eq('id', fx.eventId);
}
