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
// Characterization test for SupabaseEventRepository.save() — the precondition
// for the Phase C decomposition (architecture audit P2-2). save() is a sequence
// of independent delta-reconcilers (events row → division ids → attendees →
// waitlist → roster teams → free agents → divisions). This pins the exact
// ordered sequence of writes for a freshly-populated event (no existing child
// rows ⇒ every desired child is an INSERT) so the extraction into reconciler
// helpers can't silently reorder, drop, or mis-thread a block.
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
  private readonly filters: Array<{ k: string; v: unknown }> = [];

  constructor(
    private readonly table: string,
    private readonly log: RecordedOp[],
  ) {}

  select(): this {
    this._op = 'select';
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
    const data = this._op === 'select' && this.table === 'event_divisions' ? [{ id: DIV }] : [];
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

function recordingClient(log: RecordedOp[]) {
  return {
    from(table: string) {
      return new FakeBuilder(table, log);
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

describe('SupabaseEventRepository.save() — write sequence (characterization)', () => {
  it('writes events → divisions(id) → attendees → waitlist → teams → free agents in order', async () => {
    const log: RecordedOp[] = [];
    const repo = new SupabaseEventRepository(recordingClient(log) as never);

    await repo.save(populatedEvent());

    expect(log.map((o) => `${o.table}.${o.op}`)).toEqual([
      'events.upsert',
      'event_divisions.select', // resolve division ids → soleDivisionId
      'event_participants.select', // existing attendees
      'event_participants.insert', // new attendee
      'event_waitlist.select', // existing waitlist
      'event_waitlist.insert', // new waitlisted user
      'event_team_entries.select', // existing roster teams
      'attach_team_to_division.rpc', // new roster team
      'event_participants.select', // existing free agents
      'event_participants.insert', // new free agent
    ]);
  });

  it('threads soleDivisionId into the attendee insert and the team/free-agent division', async () => {
    const log: RecordedOp[] = [];
    const repo = new SupabaseEventRepository(recordingClient(log) as never);

    await repo.save(populatedEvent());

    const eventsUpsert = log.find((o) => o.table === 'events' && o.op === 'upsert');
    expect((eventsUpsert?.payload as { id: string }).id).toBe('event-1');

    const attendeeInsert = log.find((o) => o.table === 'event_participants' && o.op === 'insert');
    expect(attendeeInsert?.payload).toEqual([
      { division_id: DIV, user_id: 'att-1', position: null, role: 'attendee' },
    ]);

    const attachRpc = log.find((o) => o.op === 'rpc');
    expect(attachRpc?.payload).toEqual({ p_division_id: DIV, p_team_id: 'team-1' });

    const waitlistInsert = log.find((o) => o.table === 'event_waitlist' && o.op === 'insert');
    expect(waitlistInsert?.payload).toEqual([{ event_id: 'event-1', user_id: 'wait-1' }]);

    // Free-agent insert is the second event_participants insert (after attendees).
    const participantInserts = log.filter(
      (o) => o.table === 'event_participants' && o.op === 'insert',
    );
    expect(participantInserts[1]?.payload).toEqual([
      { division_id: DIV, user_id: 'fa-1', notes: 'setter', role: 'free_agent' },
    ]);
  });
});
