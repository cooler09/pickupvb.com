import { getCleanupClient, resolveUserIdByEmail } from './cleanup';

/**
 * Fixture for the OUTSIDE-window refund case (Marcus P14). Leaving a paid event
 * within `refund_window_hours` of its start must NOT auto-refund — `leaveEvent`
 * → `refundAttendeeTicket` returns `window_closed` (the window check in
 * `assertWithinRefundWindow` runs BEFORE any Stripe call), so the row is kept
 * and the buyer is told to contact the host.
 *
 * Because the window check precedes the Stripe refund, the test needs **no real
 * Checkout**: it admin-provisions a near-future paid event + a Marcus
 * `event_participant_payments` row marked `paid` (with a placeholder
 * `payment_intent_id`, which is enough to clear the `!paid → not_paid` gate but
 * is never charged — the window closes first). The event starts a few hours out
 * with a wide refund window, so `now > starts_at - window` is unambiguously true
 * regardless of run time-of-day. `refundAttendeeTicket` still requires
 * `isStripeConfigured()` on the target server, so the spec is `shouldSkipStripeTests`-
 * gated (localhost opts out). Reuses the opt-in admin client (`E2E_CLEANUP_*`).
 */

const RICHMOND_GEO = 'SRID=4326;POINT(-77.4360 37.5407)';
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function token(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++)
    s += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  return s;
}

export interface NearFuturePaidAttendeeFixture {
  eventId: string;
  attendeeId: string;
}

export function refundWindowFixtureAvailable(
  hostEmail: string | undefined,
  attendeeEmail: string | undefined,
): boolean {
  return getCleanupClient() !== null && !!hostEmail && !!attendeeEmail;
}

/**
 * Provision a published paid open-play event starting `hoursUntilStart` from now
 * (default 6) with a `refundWindowHours` window (default 24) — so the refund
 * window is already closed — and `attendeeEmail` rostered as a **paid**
 * attendee. Caller owns cleanup — pair with {@link deleteNearFuturePaidAttendee}.
 */
export async function createNearFuturePaidAttendee(opts: {
  title: string;
  hostEmail: string;
  attendeeEmail: string;
  hoursUntilStart?: number;
  refundWindowHours?: number;
}): Promise<NearFuturePaidAttendeeFixture> {
  const admin = getCleanupClient();
  if (!admin) {
    throw new Error('createNearFuturePaidAttendee: admin client unavailable — set E2E_CLEANUP_*.');
  }
  const hostId = await resolveUserIdByEmail(opts.hostEmail);
  const attendeeId = await resolveUserIdByEmail(opts.attendeeEmail);
  if (hostId === attendeeId) {
    throw new Error('createNearFuturePaidAttendee: host and attendee must differ.');
  }
  const hoursUntilStart = opts.hoursUntilStart ?? 6;
  const refundWindowHours = opts.refundWindowHours ?? 24;
  const now = Date.now();
  const startsAt = new Date(now + hoursUntilStart * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(now + (hoursUntilStart + 2) * 60 * 60 * 1000).toISOString();

  let eventId: string | null = null;
  try {
    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        host_id: hostId,
        title: opts.title,
        description:
          'E2E refund-window fixture — provisioned by tests/e2e/_helpers/refund-window-event.ts. Safe to delete.',
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
        starts_at: startsAt,
        ends_at: endsAt,
        short_code: `E2W${token(3)}`,
        time_zone: 'America/New_York',
        refund_window_hours: refundWindowHours,
      })
      .select('id')
      .single();
    if (evErr || !ev)
      throw new Error(`refund-window fixture event insert failed: ${evErr?.message}`);
    eventId = ev.id;

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
        price_cents: 1500,
      })
      .select('id')
      .single();
    if (divErr || !div)
      throw new Error(`refund-window fixture division insert failed: ${divErr?.message}`);

    const { data: part, error: partErr } = await admin
      .from('event_participants')
      .insert({ division_id: div.id, user_id: attendeeId, role: 'attendee' })
      .select('id')
      .single();
    if (partErr || !part)
      throw new Error(`refund-window fixture participant insert failed: ${partErr?.message}`);

    const { error: payErr } = await admin.from('event_participant_payments').insert({
      participant_id: part.id,
      payment_status: 'paid',
      payment_intent_id: `pi_e2e_outside_${token(12).toLowerCase()}`,
      amount_paid_cents: 1500,
      paid_at: new Date(now).toISOString(),
    });
    if (payErr) throw new Error(`refund-window fixture payment insert failed: ${payErr.message}`);

    return { eventId, attendeeId };
  } catch (err) {
    if (eventId) await admin.from('events').delete().eq('id', eventId);
    throw err;
  }
}

/**
 * Tear down a fixture from {@link createNearFuturePaidAttendee}: delete the event
 * (CASCADEs the division → participant → payment). Safe with `null` / cleanup off.
 */
export async function deleteNearFuturePaidAttendee(
  fx: NearFuturePaidAttendeeFixture | null,
): Promise<void> {
  if (!fx) return;
  const admin = getCleanupClient();
  if (!admin) return;
  await admin.from('events').delete().eq('id', fx.eventId);
}
