import { getCleanupClient, resolveUserIdByEmail } from './cleanup';

/**
 * Self-provisioning fixture for the positional-signup persona spec (Priya, P12).
 * A `by_position` open play is configured by the `events.position_roster` jsonb
 * column (`{ "libero": 1, "setter": 2 }` — added in
 * `20260514000600_event_position_roster.sql`); a non-null roster flips the event
 * detail page to render `PositionRsvpPanel` (per-position "Join" / "Join
 * waitlist" with an over-fill "Waitlist" badge). Driving the create FORM into
 * by-position mode (the `SegmentedControl` + per-position controlled count
 * inputs) is fiddly and order-sensitive, so this provisions the roster directly
 * through the service-role admin client — the same pattern as the league and
 * scoped-event fixtures — and lets the spec drive the real RSVP UI as Priya.
 *
 * The event is `public` so any viewer (Priya + a slot-filler) can see and join
 * it. Reuses the opt-in admin client (`E2E_CLEANUP_SUPABASE_*`); when unset,
 * `positionalEventFixtureAvailable()` is false and the spec is a sanctioned
 * infra-gated skip. Caller owns cleanup — pair with {@link deletePositionalEvent}
 * in `finally` (deleting the event CASCADEs its attendees).
 */

// Richmond convention-center point (lon, lat) — same coordinate the league /
// scoped-event fixtures use. `events.geo` is `geography(point,4326)` (EWKT).
const RICHMOND_GEO = 'SRID=4326;POINT(-77.4360 37.5407)';

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function token(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++)
    s += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  return s;
}

export interface PositionalEventFixture {
  eventId: string;
}

/**
 * True when the positional-event fixture can be provisioned (the opt-in admin
 * client is configured). The spec `test.skip`s on false: there's no reliable
 * single-account UI path to stand up a by-position roster AND fill a slot for
 * the over-fill case.
 */
export function positionalEventFixtureAvailable(): boolean {
  return getCleanupClient() !== null;
}

/**
 * Provision a published, public `by_position` open play hosted by `hostEmail`
 * with the given per-position target counts (jsonb keys are the lowercase
 * `EventPosition` values, e.g. `{ libero: 1 }`). Caller owns cleanup — pair with
 * {@link deletePositionalEvent}.
 */
export async function createPositionalEvent(opts: {
  title: string;
  hostEmail: string;
  positionRoster: Record<string, number>;
}): Promise<PositionalEventFixture> {
  const admin = getCleanupClient();
  if (!admin) {
    throw new Error(
      'createPositionalEvent: admin client unavailable — set E2E_CLEANUP_SUPABASE_URL / _SECRET_KEY.',
    );
  }
  const hostId = await resolveUserIdByEmail(opts.hostEmail);

  const now = Date.now();
  const base = {
    host_id: hostId,
    title: opts.title,
    description:
      'E2E positional fixture — provisioned by tests/e2e/_helpers/positional-event.ts. Safe to delete.',
    surface: 'indoor' as const,
    type: 'open_play' as const,
    visibility: 'public' as const,
    status: 'published' as const,
    address_line: '500 E Marshall St',
    city: 'Richmond',
    region: 'VA',
    postal_code: '23219',
    country: 'US',
    geo: RICHMOND_GEO,
    starts_at: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
    ends_at: new Date(now + 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
    short_code: `E2P${token(3)}`,
    time_zone: 'America/New_York',
  };
  const { data: ev, error } = await admin.from('events').insert(base).select('id').single();
  if (error || !ev) throw new Error(`positional fixture event insert failed: ${error?.message}`);

  // `position_roster` was MOVED off `events` onto `event_divisions`
  // (20260806000000_event_divisions_position_roster.sql) — `events.position_roster`
  // no longer exists. The runtime reads it from the division
  // (`divisionRowToPositionRoster(DivisionRow)`), so the by-position roster goes
  // on the event's (solo open-play) division, which flips the detail page to the
  // `PositionRsvpPanel`.
  const { error: divErr } = await admin.from('event_divisions').insert({
    event_id: ev.id,
    sort_order: 0,
    label: 'Open',
    surface: 'indoor',
    format: 'sixes',
    gender: 'coed',
    skill_tier: 'bb',
    team_composition: 'solo',
    capacity_kind: 'unlimited',
    position_roster: opts.positionRoster,
  });
  if (divErr) {
    await admin.from('events').delete().eq('id', ev.id);
    throw new Error(`positional fixture division insert failed: ${divErr.message}`);
  }
  return { eventId: ev.id };
}

/**
 * Tear down a fixture from {@link createPositionalEvent}: delete the event
 * (CASCADEs its attendees). Safe with `null` and when cleanup is disabled.
 */
export async function deletePositionalEvent(fx: PositionalEventFixture | null): Promise<void> {
  if (!fx) return;
  const admin = getCleanupClient();
  if (!admin) return;
  await admin.from('events').delete().eq('id', fx.eventId);
}
