import { getCleanupClient } from './cleanup';

/**
 * Self-provisioning fixture for the league e2e spec (Phase 2, e2e audit C2).
 *
 * Unlike tournaments — which have the host-only **walk-in team** escape hatch
 * and a first-class `/events/new` create flow — leagues have **no UI path at
 * all**: the event-type chooser only offers Open Play / Tournament, and the
 * event-detail signup area renders nothing for `type === 'league'`. League
 * events can only be brought into existence at the data layer (the
 * `add_league_to_event_type` migration says as much: "League events can be
 * inserted via the API but have no first-class create flow yet"). So a
 * mutating league test has to provision its own event + division + rostered
 * teams through the service-role client, then drive the schedule / forfeit
 * surfaces through the real UI.
 *
 * This helper reuses the opt-in admin client from `cleanup.ts`
 * (`E2E_CLEANUP_SUPABASE_*`). When those env vars are unset the whole league
 * spec is a sanctioned infra-gated skip (`leagueFixtureAvailable()` is false)
 * — there is genuinely no other way to stand a league up. Each test owns its
 * fixture and tears it down in `finally` via {@link deleteLeagueFixture};
 * deleting the event CASCADEs divisions → entries → schedule matches, and the
 * helper additionally hard-deletes the standalone `teams` rows it created.
 *
 * Shape mirrors `supabase/snippets/seed-tournament-fixture.sql` (the proven
 * row recipe), reworked for a league: `events.type = 'league'`, a single
 * `roster` division (the league domain invariant forbids ad-hoc / solo
 * divisions), and N rostered `event_team_entries` whose `team_id` FKs into
 * `teams` so the schedule's home/away pickers and the forfeit panel can see
 * them.
 */

// Richmond convention-center point (lon, lat) — same coordinate the tournament
// seed uses. `events.geo` is `geography(point,4326)`; PostgREST accepts EWKT.
const RICHMOND_GEO = 'SRID=4326;POINT(-77.4360 37.5407)';

export interface LeagueTeamRef {
  id: string;
  name: string;
}

export interface LeagueFixture {
  eventId: string;
  divisionId: string;
  shortCode: string;
  /** Rostered teams, in the order their names were passed in. */
  teams: LeagueTeamRef[];
}

export interface CreateLeagueFixtureOptions {
  title: string;
  /**
   * Distinct team names (≥ 1). Each becomes a rostered team captained by the
   * host (attendee-a) so a single account can drive the whole flow — no
   * second actor, no captain hand-off.
   */
  teamNames: ReadonlyArray<string>;
}

/**
 * True when the league fixture can be provisioned — i.e. the opt-in admin
 * client is configured (`E2E_CLEANUP_SUPABASE_*`) and the host email
 * (`TEST_USER_EMAIL`, attendee-a) is known. The spec `test.skip`s on false:
 * leagues have no UI provisioning path, so without service-role access there
 * is no honest way to exercise them — a sanctioned infra gate, not a silent
 * coverage hole.
 */
export function leagueFixtureAvailable(): boolean {
  return getCleanupClient() !== null && !!process.env['TEST_USER_EMAIL'];
}

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function token(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return s;
}

/**
 * Resolve a test account's auth user id by email via the GoTrue admin API.
 * The dev project has a small, stable user set, so paging a couple of hundred
 * at a time finds the address on the first page. Throws (loudly) when the
 * account is missing — the seed-fixture preconditions (sign in once as each
 * test account) apply here too.
 */
async function resolveUserIdByEmail(
  admin: NonNullable<ReturnType<typeof getCleanupClient>>,
  email: string,
): Promise<string> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`league fixture: listUsers failed — ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  throw new Error(
    `league fixture: no auth user for ${email}. Sign in once as that account to provision auth.users + profiles, then retry.`,
  );
}

/**
 * Provision a published league event hosted by attendee-a with one roster
 * division and `teamNames.length` rostered teams (all captained by the host).
 *
 * The event window is intentionally wide and currently-live (starts 1h ago,
 * ends in 21 days) so any near-future `datetime-local` the schedule UI submits
 * lands inside `[startsAt, endsAt]` — the `LeagueSchedule.addMatch` invariant
 * rejects out-of-window matches, and the naive `datetime-local` → server
 * `new Date()` parse can skew by the server's TZ offset, which the wide window
 * absorbs.
 *
 * Caller owns cleanup — always pair with {@link deleteLeagueFixture} in
 * `finally`.
 */
export async function createLeagueFixture(
  opts: CreateLeagueFixtureOptions,
): Promise<LeagueFixture> {
  const admin = getCleanupClient();
  if (!admin) {
    throw new Error(
      'createLeagueFixture: admin client unavailable — set E2E_CLEANUP_SUPABASE_URL / _SECRET_KEY (see _helpers/cleanup.ts).',
    );
  }
  const hostEmail = process.env['TEST_USER_EMAIL'];
  if (!hostEmail) throw new Error('createLeagueFixture: TEST_USER_EMAIL is required (the host).');
  if (opts.teamNames.length === 0) throw new Error('createLeagueFixture: at least one team name.');

  const hostId = await resolveUserIdByEmail(admin, hostEmail);

  const now = Date.now();
  const startsAt = new Date(now - 60 * 60 * 1000).toISOString();
  const endsAt = new Date(now + 21 * 24 * 60 * 60 * 1000).toISOString();
  const shortCode = `E2L${token(3)}`;

  let eventId: string | null = null;
  const teamIds: string[] = [];
  try {
    const { data: ev, error: evErr } = await admin
      .from('events')
      .insert({
        host_id: hostId,
        title: opts.title,
        description:
          'E2E league fixture — provisioned by tests/e2e/_helpers/league.ts. Safe to delete.',
        surface: 'indoor',
        type: 'league',
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
    if (evErr || !ev) throw new Error(`league fixture event insert failed: ${evErr?.message}`);
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
      })
      .select('id')
      .single();
    if (divErr || !div)
      throw new Error(`league fixture division insert failed: ${divErr?.message}`);
    const divisionId = div.id;

    const teams: LeagueTeamRef[] = [];
    for (const name of opts.teamNames) {
      const { data: team, error: teamErr } = await admin
        .from('teams')
        .insert({
          captain_id: hostId,
          name,
          format: 'sixes',
          slug: `e2e-league-${token(8).toLowerCase()}`,
        })
        .select('id')
        .single();
      if (teamErr || !team)
        throw new Error(`league fixture team insert failed: ${teamErr?.message}`);
      teamIds.push(team.id);

      const { error: memberErr } = await admin
        .from('team_members')
        .insert({ team_id: team.id, user_id: hostId });
      if (memberErr)
        throw new Error(`league fixture team_member insert failed: ${memberErr.message}`);

      const { error: entryErr } = await admin.from('event_team_entries').insert({
        division_id: divisionId,
        team_id: team.id,
        source: 'roster',
        display_name: name,
        captain_id: hostId,
      });
      if (entryErr) throw new Error(`league fixture entry insert failed: ${entryErr.message}`);

      teams.push({ id: team.id, name });
    }

    return { eventId, divisionId, shortCode, teams };
  } catch (err) {
    // Best-effort rollback of whatever landed before the failure.
    await deleteLeagueFixture(
      eventId
        ? { eventId, divisionId: '', shortCode, teams: teamIds.map((id) => ({ id, name: '' })) }
        : null,
    );
    throw err;
  }
}

/**
 * Tear down a fixture from `createLeagueFixture`. Deleting the event CASCADEs
 * its divisions → `event_team_entries` → `league_schedule_matches`; the
 * standalone `teams` (and their `team_members`) are deleted explicitly since
 * nothing cascades to them from the event side. Safe to call with `null` and
 * when cleanup is disabled (both no-op).
 */
export async function deleteLeagueFixture(fx: LeagueFixture | null): Promise<void> {
  if (!fx) return;
  const admin = getCleanupClient();
  if (!admin) return;
  await admin.from('events').delete().eq('id', fx.eventId);
  const teamIds = fx.teams.map((t) => t.id).filter((id) => id.length > 0);
  if (teamIds.length > 0) {
    await admin.from('team_members').delete().in('team_id', teamIds);
    await admin.from('teams').delete().in('id', teamIds);
  }
}
