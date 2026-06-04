import { getCleanupClient, resolveUserIdByEmail } from './cleanup';

/**
 * Self-provisioning fixture for the captain team-registration persona specs
 * (Adam P9 / Bianca P10 — e2e audit Tier C). Stands up a **tournament** event
 * with a single **roster** division plus a team **captained by the persona** but
 * NOT yet registered, so the spec can drive the real `TournamentSignupPanel`
 * registration flow (`registerTeamFromForm` → `RegisterTeamCommand`) and assert
 * the team lands in the division (AGENTS.md Pattern 6 — `division_id` at the
 * registration boundary).
 *
 * Why admin-provisioned rather than UI: a tournament can be created through
 * `/events/new`, but seeding a *roster* division + a captain-owned team that the
 * persona can register in a single signed-in pass is far simpler at the data
 * layer — and it mirrors the `league.ts` / `scoped-event.ts` shape. Reuses the
 * opt-in admin client from `cleanup.ts` (`E2E_CLEANUP_SUPABASE_*`); when unset
 * `rosterTournamentFixtureAvailable()` is false and the spec is a sanctioned
 * infra-gated skip.
 *
 * The event window is in the **future** (starts in 3 days): `RegisterTeam`'s
 * aggregate invariant rejects registration once the event has started, so —
 * unlike the league fixture, which starts 1h ago because it drives the live
 * schedule — this one must not have begun.
 *
 * Each test owns its fixture and tears it down in `finally` via
 * {@link deleteRosterTournamentFixture}: deleting the event CASCADEs the
 * division → any entries, and the helper hard-deletes the standalone `teams`
 * row it created (teams are independent of the event).
 */

// Richmond convention-center point (lon, lat). `events.geo` is
// `geography(point,4326)`; PostgREST accepts EWKT. Same coordinate the league +
// scoped-event fixtures use.
const RICHMOND_GEO = 'SRID=4326;POINT(-77.4360 37.5407)';

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function token(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++)
    s += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  return s;
}

export interface RosterTournamentFixture {
  eventId: string;
  divisionId: string;
  shortCode: string;
  /** The persistent `teams.id` of the captain's (unregistered) team. */
  teamId: string;
  teamSlug: string;
  /** The captain's team name — assertable in the "Registered" list after signup. */
  teamName: string;
  /** `events.host_id` — distinct from the captain. */
  hostId: string;
  captainId: string;
}

export interface CreateRosterTournamentFixtureOptions {
  title: string;
  /** Email of the account that becomes `events.host_id` (hosts, does not captain). */
  hostEmail: string;
  /**
   * Email of the persona who captains the seeded (unregistered) team and drives
   * the registration UI. Must differ from `hostEmail`.
   */
  captainEmail: string;
  /** Optional team name (defaults to an `E2E …` throwaway). */
  teamName?: string;
}

/**
 * True when the fixture can be provisioned — the opt-in admin client is
 * configured (`E2E_CLEANUP_SUPABASE_*`) and both emails are known. The spec
 * `test.skip`s on false (a sanctioned infra gate, not a silent hole).
 */
export function rosterTournamentFixtureAvailable(
  hostEmail: string | undefined,
  captainEmail: string | undefined,
): boolean {
  return getCleanupClient() !== null && !!hostEmail && !!captainEmail;
}

/**
 * Provision a published tournament hosted by `hostEmail` with one roster
 * division (free agents enabled) and a team captained by `captainEmail` that is
 * NOT yet registered. Caller owns cleanup — always pair with
 * {@link deleteRosterTournamentFixture} in `finally`.
 */
export async function createRosterTournamentFixture(
  opts: CreateRosterTournamentFixtureOptions,
): Promise<RosterTournamentFixture> {
  const admin = getCleanupClient();
  if (!admin) {
    throw new Error(
      'createRosterTournamentFixture: admin client unavailable — set E2E_CLEANUP_SUPABASE_URL / _SECRET_KEY (see _helpers/cleanup.ts).',
    );
  }
  const hostId = await resolveUserIdByEmail(opts.hostEmail);
  const captainId = await resolveUserIdByEmail(opts.captainEmail);
  if (hostId === captainId) {
    throw new Error('createRosterTournamentFixture: host and captain must be different accounts.');
  }

  const now = Date.now();
  const startsAt = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(now + 3 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000).toISOString();
  const shortCode = `E2R${token(3)}`;
  const teamName = opts.teamName ?? `E2E Roster Squad ${token(4)}`;

  let eventId: string | null = null;
  let teamId: string | null = null;
  try {
    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        host_id: hostId,
        title: opts.title,
        description:
          'E2E roster-tournament fixture — provisioned by tests/e2e/_helpers/roster-tournament.ts. Safe to delete.',
        surface: 'indoor',
        type: 'tournament',
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
        short_code: shortCode,
        time_zone: 'America/New_York',
      })
      .select('id')
      .single();
    if (evErr || !ev)
      throw new Error(`roster-tournament fixture event insert failed: ${evErr?.message}`);
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
        team_composition: 'team',
        team_size: 6,
        team_registration_mode: 'roster',
        capacity_kind: 'unlimited',
        allow_free_agents: true,
      })
      .select('id')
      .single();
    if (divErr || !div)
      throw new Error(`roster-tournament fixture division insert failed: ${divErr?.message}`);

    const { data: team, error: teamErr } = await admin
      .from('teams')
      .insert({
        captain_id: captainId,
        name: teamName,
        slug: `e2e-roster-${token(8).toLowerCase()}`,
      })
      .select('id, slug')
      .single();
    if (teamErr || !team)
      throw new Error(`roster-tournament fixture team insert failed: ${teamErr?.message}`);
    teamId = team.id;

    const { error: memberErr } = await admin
      .from('team_members')
      .insert({ team_id: team.id, user_id: captainId });
    if (memberErr)
      throw new Error(`roster-tournament fixture team_member insert failed: ${memberErr.message}`);

    return {
      eventId,
      divisionId: div.id,
      shortCode,
      teamId: team.id,
      teamSlug: team.slug,
      teamName,
      hostId,
      captainId,
    };
  } catch (err) {
    // Best-effort rollback of whatever landed before the failure.
    if (teamId) await admin.from('teams').delete().eq('id', teamId);
    if (eventId) await admin.from('events').delete().eq('id', eventId);
    throw err;
  }
}

/**
 * Tear down a fixture from {@link createRosterTournamentFixture}: delete the
 * event (CASCADEs the division + any team entries) and hard-delete the
 * standalone team. Safe with `null` / cleanup disabled (both no-op).
 */
export async function deleteRosterTournamentFixture(
  fx: RosterTournamentFixture | null,
): Promise<void> {
  if (!fx) return;
  const admin = getCleanupClient();
  if (!admin) return;
  await admin.from('events').delete().eq('id', fx.eventId);
  await admin.from('teams').delete().eq('id', fx.teamId);
}
