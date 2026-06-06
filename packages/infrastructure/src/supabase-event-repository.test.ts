import { describe, expect, it } from 'vitest';
import {
  Capacity,
  EventType,
  Location,
  Surface,
  Visibility,
  VolleyballEvent,
  type DivisionId,
  type EventId,
  type TeamId,
  type UserId,
} from '@pickupvb/domain';
import { SupabaseEventRepository } from './supabase-event-repository.js';

// ----------------------------------------------------------------------------
// Characterization tests for SupabaseEventRepository (architecture audit P2-2).
// save() persists the whole aggregate atomically via the single `save_event`
// RPC (inc. 3); these pin that it issues exactly one RPC carrying the full
// desired state (the contract the PL/pgSQL function implements). getDetail()'s
// read-query sequence is pinned further down.
// ----------------------------------------------------------------------------

const DIV = '11111111-1111-1111-1111-111111111111';

interface RecordedOp {
  table: string;
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' | 'rpc';
  payload?: unknown;
  filters: Array<{ k: string; v: unknown }>;
}

/** A thenable PostgREST-builder stand-in: records the terminal op when awaited
 *  and resolves selects with canned data (only `event_divisions.select('id')`
 *  returns a row, so `soleDivisionId` resolves and child inserts fire). */
class FakeBuilder implements PromiseLike<{ data: unknown; error: null }> {
  private _op: RecordedOp['op'] = 'select';
  private _payload?: unknown;
  private _single = false;
  private readonly filters: Array<{ k: string; v: unknown }> = [];

  constructor(
    private readonly table: string,
    private readonly log: RecordedOp[],
    private readonly canned: (table: string, single: boolean) => unknown,
  ) {}

  select(): this {
    this._op = 'select';
    return this;
  }
  maybeSingle(): this {
    this._single = true;
    return this;
  }
  insert(payload: unknown): this {
    this._op = 'insert';
    this._payload = payload;
    return this;
  }
  upsert(payload: unknown): this {
    this._op = 'upsert';
    this._payload = payload;
    return this;
  }
  update(payload: unknown): this {
    this._op = 'update';
    this._payload = payload;
    return this;
  }
  delete(): this {
    this._op = 'delete';
    return this;
  }
  eq(k: string, v: unknown): this {
    this.filters.push({ k, v });
    return this;
  }
  in(k: string, v: unknown): this {
    this.filters.push({ k, v });
    return this;
  }
  is(k: string, v: unknown): this {
    this.filters.push({ k, v });
    return this;
  }
  not(k: string, _op: string, v: unknown): this {
    this.filters.push({ k, v });
    return this;
  }
  order(): this {
    return this;
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.log.push({
      table: this.table,
      op: this._op,
      payload: this._payload,
      filters: this.filters,
    });
    const data = this._op === 'select' ? this.canned(this.table, this._single) : null;
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

function recordingClient(log: RecordedOp[], canned: (table: string, single: boolean) => unknown) {
  return {
    from(table: string) {
      return new FakeBuilder(table, log, canned);
    },
    rpc(name: string, args: unknown) {
      log.push({ table: name, op: 'rpc', payload: args, filters: [] });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

const LOCATION = Location.create({
  addressLine: '1 Main St',
  city: 'Long Beach',
  region: 'CA',
  postalCode: '90802',
  country: 'US',
  latitude: 33.77,
  longitude: -118.19,
});

/** A populated open-play event with one attendee, one waitlisted user, one
 *  roster team, and one free agent — no aggregate-level divisions (so the test
 *  exercises the five child-reconcile blocks without building a Division). */
function populatedEvent(): VolleyballEvent {
  return VolleyballEvent.fromPersistence({
    id: 'event-1' as EventId,
    hostId: 'host-1' as UserId,
    title: 'Tuesday Open Play',
    description: '',
    rules: '',
    surface: Surface.Indoor,
    type: EventType.OpenPlay,
    visibility: Visibility.Public,
    location: LOCATION,
    timeZone: 'America/Los_Angeles',
    startsAt: new Date('2026-07-01T18:00:00Z'),
    endsAt: new Date('2026-07-01T20:00:00Z'),
    capacity: Capacity.fixed(12),
    status: 'published',
    attendees: [['att-1' as UserId, null]],
    teams: [['team-1' as TeamId, DIV as DivisionId]],
    freeAgents: [['fa-1' as UserId, { divisionId: DIV as DivisionId, notes: 'setter' }]],
    waitlist: ['wait-1' as UserId],
  });
}

describe('SupabaseEventRepository.save() — single atomic save_event RPC (characterization)', () => {
  it('persists the whole aggregate via exactly one save_event RPC (no per-table writes)', async () => {
    const log: RecordedOp[] = [];
    const repo = new SupabaseEventRepository(recordingClient(log, () => []) as never);

    await repo.save(populatedEvent());

    // The entire persist is one transactional RPC — no individual table writes.
    expect(log.map((o) => `${o.table}.${o.op}`)).toEqual(['save_event.rpc']);
  });

  it('passes the full desired state as the save_event payload', async () => {
    const log: RecordedOp[] = [];
    const repo = new SupabaseEventRepository(recordingClient(log, () => []) as never);

    await repo.save(populatedEvent());

    const args = log[0]!.payload as {
      p_event: { id: string; host_id: string; geo: string; status: string };
      p_attendees: unknown;
      p_waitlist: unknown;
      p_teams: unknown;
      p_free_agents: unknown;
      p_divisions: unknown;
    };
    expect(args.p_event.id).toBe('event-1');
    expect(args.p_event.host_id).toBe('host-1');
    expect(args.p_event.status).toBe('published');
    // WKT is `POINT(longitude latitude)`.
    expect(args.p_event.geo).toBe('SRID=4326;POINT(-118.19 33.77)');
    expect(args.p_attendees).toEqual([{ user_id: 'att-1', position: null }]);
    expect(args.p_waitlist).toEqual(['wait-1']);
    expect(args.p_teams).toEqual([{ team_id: 'team-1', division_id: DIV }]);
    expect(args.p_free_agents).toEqual([{ user_id: 'fa-1', division_id: DIV, notes: 'setter' }]);
    // populatedEvent carries no aggregate-level divisions.
    expect(args.p_divisions).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// Characterization test for getDetail() — the precondition for the Phase C inc. 2
// query-wave extraction into loader methods. getDetail loads the event row, then
// runs two parallel read waves (+ a conditional podium read + a viewer-team
// read), then assembles via the (separately-tested) mappers. This pins the read
// query SEQUENCE + key filters so the I/O extraction can't reorder, drop, or
// change a query. (Parsing is already covered by event-detail/mappers.test.ts.)
// ----------------------------------------------------------------------------

// Sparse event row: getDetail tolerates undefined columns (it never throws on
// them — `new Date(undefined)` is Invalid Date, not an error), so only the
// fields that *steer* which queries fire matter: `host_id` set (→ the primary-
// host `profiles` read fires), `host_group_id` null (→ the host-group reads are
// skipped via `Promise.resolve`).
const EVENT_ROW = { id: 'event-1', host_id: 'host-1', host_group_id: null };

/** getDetail canned reads: the event row for `events_view`; `null` for any
 *  `.maybeSingle()` lookup; `[]` for every list select (no children ⇒ the
 *  team/division-dependent wave-2 reads + the podium read are all skipped). */
const getDetailCanned = (table: string, single: boolean): unknown =>
  table === 'events_view' ? EVENT_ROW : single ? null : [];

describe('SupabaseEventRepository.getDetail() — read sequence (characterization)', () => {
  it('issues the event row, wave 1, then the viewer-scoped wave 2 in order', async () => {
    const log: RecordedOp[] = [];
    const repo = new SupabaseEventRepository(recordingClient(log, getDetailCanned) as never);

    await repo.getDetail('event-1', 'viewer-1');

    // host_group_id is null ⇒ the `groups` (wave 1) and the host-group-role
    // `group_members` (wave 2) reads are skipped; no divisions ⇒ no podium read;
    // no registered teams + no captained teams ⇒ those wave-2 reads are skipped.
    expect(log.map((o) => o.table)).toEqual([
      'events_view', // event row
      'event_participants', // wave 1: attendees
      'event_co_hosts', // wave 1: co-hosts
      'profiles', // wave 1: primary host user (host_id set)
      'event_team_entries', // wave 1: roster teams
      'event_participants', // wave 1: free agents
      'event_divisions', // wave 1: divisions
      'friendships', // wave 2: viewer friends
      'group_members', // wave 2: viewer hostable groups
      'teams', // wave 2: viewer captained teams
    ]);
  });

  it('scopes the event row and wave-1 attendee read to the event id', async () => {
    const log: RecordedOp[] = [];
    const repo = new SupabaseEventRepository(recordingClient(log, getDetailCanned) as never);

    await repo.getDetail('event-1', null);

    const eventRow = log.find((o) => o.table === 'events_view');
    expect(eventRow?.filters).toContainEqual({ k: 'id', v: 'event-1' });

    const attendees = log.find((o) => o.table === 'event_participants');
    expect(attendees?.filters).toContainEqual({ k: 'division.event_id', v: 'event-1' });

    // viewerId null ⇒ every viewer-scoped wave-2 read is skipped.
    expect(log.some((o) => o.table === 'friendships')).toBe(false);
    expect(log.some((o) => o.table === 'teams')).toBe(false);
  });

  it('returns null when the event row is absent', async () => {
    const log: RecordedOp[] = [];
    const repo = new SupabaseEventRepository(recordingClient(log, () => null) as never);

    expect(await repo.getDetail('missing', null)).toBeNull();
    expect(log.map((o) => o.table)).toEqual(['events_view']);
  });
});
