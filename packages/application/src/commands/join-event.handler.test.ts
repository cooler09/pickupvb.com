import { describe, it, expect } from 'vitest';
import {
  Capacity,
  EventStatus,
  EventType,
  Format,
  Gender,
  Location,
  SkillLevel,
  Surface,
  Visibility,
  VolleyballEvent,
  NotFoundError,
  ValidationError,
  type EventRepository,
  type EventId,
  type UserId,
} from '@pickupvb/domain';
import {
  JoinEventHandler,
  JoinEventWithPositionHandler,
  LeaveEventHandler,
} from './join-event.handler.js';

const LOCATION = Location.create({
  addressLine: '1 Main',
  city: 'LB',
  region: 'CA',
  postalCode: '90802',
  country: 'US',
  latitude: 33.77,
  longitude: -118.19,
});

function tomorrow(h = 0): Date {
  return new Date(Date.now() + (24 + h) * 60 * 60 * 1000);
}

function makeOpenPlay(): VolleyballEvent {
  const evt = VolleyballEvent.create({
    id: 'event-1' as EventId,
    hostId: 'host' as UserId,
    title: 'Open Play',
    description: '',
    rules: '',
    surface: Surface.Indoor,
    format: Format.Sixes,
    gender: Gender.Coed,
    skillLevel: SkillLevel.Intermediate,
    type: EventType.OpenPlay,
    visibility: Visibility.Public,
    location: LOCATION,
    startsAt: tomorrow(),
    endsAt: tomorrow(2),
    capacity: Capacity.fixed(4),
  });
  evt.publish();
  return evt;
}

/** Minimal in-memory adapter; only implements the methods these handlers use. */
class InMemoryEventRepo implements Pick<EventRepository, 'findById' | 'save'> {
  private store = new Map<string, VolleyballEvent>();
  saved: VolleyballEvent[] = [];

  put(evt: VolleyballEvent) {
    this.store.set(String(evt.id), evt);
  }
  async findById(id: string): Promise<VolleyballEvent | null> {
    return this.store.get(id) ?? null;
  }
  async save(evt: VolleyballEvent): Promise<void> {
    this.saved.push(evt);
    this.store.set(String(evt.id), evt);
  }
}

describe('JoinEventHandler', () => {
  it('joins the user and saves the aggregate', async () => {
    const repo = new InMemoryEventRepo();
    repo.put(makeOpenPlay());
    const handler = new JoinEventHandler(repo as unknown as EventRepository);

    await handler.execute({ eventId: 'event-1', userId: 'alice' });

    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]!.attendees.has('alice' as UserId)).toBe(true);
  });

  it('throws NotFoundError when the event does not exist', async () => {
    const repo = new InMemoryEventRepo();
    const handler = new JoinEventHandler(repo as unknown as EventRepository);
    await expect(handler.execute({ eventId: 'missing', userId: 'alice' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('JoinEventWithPositionHandler', () => {
  it('rejects an unknown position string with ValidationError', async () => {
    const repo = new InMemoryEventRepo();
    repo.put(makeOpenPlay());
    const handler = new JoinEventWithPositionHandler(repo as unknown as EventRepository);
    await expect(
      handler.execute({ eventId: 'event-1', userId: 'alice', position: 'goalkeeper' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError when the event does not exist', async () => {
    const repo = new InMemoryEventRepo();
    const handler = new JoinEventWithPositionHandler(repo as unknown as EventRepository);
    await expect(
      handler.execute({ eventId: 'missing', userId: 'alice', position: 'setter' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('LeaveEventHandler', () => {
  it('removes the attendee and saves', async () => {
    const repo = new InMemoryEventRepo();
    const evt = makeOpenPlay();
    evt.joinAsPlayer('alice' as UserId);
    repo.put(evt);
    const handler = new LeaveEventHandler(repo as unknown as EventRepository);

    await handler.execute({ eventId: 'event-1', userId: 'alice' });

    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]!.attendees.has('alice' as UserId)).toBe(false);
  });

  it('propagates NotFoundError when the user has not joined', async () => {
    const repo = new InMemoryEventRepo();
    repo.put(makeOpenPlay());
    const handler = new LeaveEventHandler(repo as unknown as EventRepository);
    await expect(handler.execute({ eventId: 'event-1', userId: 'ghost' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

// EventStatus import is here only to keep `import` typechecking honest if a
// future test needs to assert state — silences the unused-import rule.
void EventStatus;
