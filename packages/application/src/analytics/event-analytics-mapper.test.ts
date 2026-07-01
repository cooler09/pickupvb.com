import { describe, expect, it } from 'vitest';
import {
  AggregateRoot,
  AgeGroup,
  BracketCompleted,
  Capacity,
  Division,
  EventCancelled,
  EventCreated,
  EventPublished,
  EventType,
  Format,
  FreeAgentJoined,
  Gender,
  Location,
  Poll,
  PollClosed,
  PollCreated,
  PriceUnit,
  SkillLevel,
  SkillTier,
  Surface,
  TeamComposition,
  TeamRegistered,
  Visibility,
  VolleyballEvent,
  SpotFilled,
  SpotReleased,
  type DomainEvent,
  type DivisionId,
  type EventId,
  type UserId,
} from '@pickupvb/domain';
import { mapDomainEventToAnalytics } from './event-analytics-mapper.js';

/**
 * Minimal non-`VolleyballEvent` aggregate, to prove the mapper's
 * `instanceof VolleyballEvent` narrow (P2-4 generalization): the dispatcher
 * now hands any `AggregateRoot` to the mapper, so a `SpotFilled`-shaped event
 * arriving with the wrong aggregate must map to `null` rather than try to read
 * VolleyballEvent-only props off it.
 */
class StubAggregate extends AggregateRoot<string> {
  constructor() {
    super('stub-1');
  }
  emit(e: DomainEvent): void {
    this.raise(e);
  }
}

const LOCATION = Location.create({
  addressLine: '1 Main',
  city: 'Long Beach',
  region: 'CA',
  postalCode: '90802',
  country: 'US',
  latitude: 33.77,
  longitude: -118.19,
});

function tomorrow(h = 0): Date {
  return new Date(Date.now() + (24 + h) * 60 * 60 * 1000);
}

function makeOpenPlayEvent(opts?: { priceCents?: number | null }): VolleyballEvent {
  const evt = VolleyballEvent.create({
    id: 'event-1' as EventId,
    hostId: 'host-9' as UserId,
    title: 'Friday Pickup',
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
    capacity: Capacity.fixed(8),
    divisions: [
      Division.create({
        id: 'div-default' as DivisionId,
        sortOrder: 0,
        label: 'Open',
        surface: Surface.Indoor,
        format: Format.Sixes,
        gender: Gender.Coed,
        skillTier: SkillTier.B,
        ageGroup: AgeGroup.Adult,
        tierLabel: null,
        teamComposition: TeamComposition.Solo,
        teamSize: null,
        capacity: Capacity.fixed(8),
        priceCents: opts?.priceCents ?? 0,
        priceUnit: PriceUnit.PerPlayer,
        prizeText: null,
        prizePurseCents: null,
        startsAt: null,
        endsAt: null,
        allowFreeAgents: false,
      }),
    ],
  });
  evt.publish();
  evt.pullEvents(); // drain create/publish — tests focus on later raises.
  return evt;
}

describe('mapDomainEventToAnalytics', () => {
  it('maps SpotFilled to event_joined with EventScopedProps + waitlist/position', () => {
    const evt = makeOpenPlayEvent({ priceCents: 1500 });
    const de = new SpotFilled('event-1', 'alice', 7, null, false);

    const result = mapDomainEventToAnalytics(de, evt);
    expect(result).not.toBeNull();
    expect(result!.actorId).toBe('alice');
    expect(result!.event.name).toBe('event_joined');
    expect(result!.event.props).toEqual({
      eventId: 'event-1',
      hostId: 'host-9',
      eventType: 'open_play',
      byPosition: false,
      priceCents: 1500,
      metroId: 'Long Beach',
      waitlist: false,
      position: null,
    });
  });

  it('propagates waitlist + position from SpotFilled', () => {
    const evt = makeOpenPlayEvent();
    const de = new SpotFilled('event-1', 'bob', 0, 'setter', true);

    const result = mapDomainEventToAnalytics(de, evt);
    expect(result!.event.name).toBe('event_joined');
    expect(result!.event.props).toMatchObject({ waitlist: true, position: 'setter' });
  });

  it('maps SpotReleased to event_left', () => {
    const evt = makeOpenPlayEvent();
    const de = new SpotReleased('event-1', 'alice');

    const result = mapDomainEventToAnalytics(de, evt);
    expect(result).not.toBeNull();
    expect(result!.actorId).toBe('alice');
    expect(result!.event.name).toBe('event_left');
    expect(result!.event.props).toEqual({
      eventId: 'event-1',
      hostId: 'host-9',
      eventType: 'open_play',
      byPosition: false,
      priceCents: 0,
      metroId: 'Long Beach',
    });
  });

  it('returns null for domain events outside the analytics taxonomy', () => {
    const evt = makeOpenPlayEvent();
    expect(mapDomainEventToAnalytics(new EventCreated('event-1'), evt)).toBeNull();
    expect(mapDomainEventToAnalytics(new EventPublished('event-1'), evt)).toBeNull();
    expect(mapDomainEventToAnalytics(new EventCancelled('event-1', 'weather'), evt)).toBeNull();
    expect(mapDomainEventToAnalytics(new TeamRegistered('event-1', 'team-1'), evt)).toBeNull();
    expect(mapDomainEventToAnalytics(new FreeAgentJoined('event-1', 'alice'), evt)).toBeNull();
  });

  // ---- P2-4 generalization: mapper accepts any aggregate, fail-quiet --------

  it('returns null for Bracket events (no taxonomy entry), without reading event props', () => {
    // A Bracket aggregate now flows through the same outbox; its events have no
    // analytics counterpart and must map to null.
    const bracket = new StubAggregate();
    expect(mapDomainEventToAnalytics(new BracketCompleted('bracket-1'), bracket)).toBeNull();
  });

  it('returns null when a SpotFilled arrives with a non-VolleyballEvent aggregate (instanceof guard)', () => {
    // Without the `aggregate instanceof VolleyballEvent` narrow this would
    // crash calling `eventScopedProps` on the wrong aggregate type.
    const stub = new StubAggregate();
    expect(mapDomainEventToAnalytics(new SpotFilled('event-1', 'alice', 0), stub)).toBeNull();
    expect(mapDomainEventToAnalytics(new SpotReleased('event-1', 'alice'), stub)).toBeNull();
  });

  // ---- Poll lifecycle (ADR 0041) --------------------------------------------

  function makePoll(overrides: Partial<Parameters<typeof Poll.create>[0]> = {}) {
    return Poll.create({
      id: 'poll-1',
      creatorId: 'host-9',
      title: 'Who’s coming?',
      questions: [
        {
          id: 'q1',
          prompt: 'Are you coming?',
          kind: 'single',
          required: true,
          options: [
            { id: 'o1', label: 'Yes' },
            { id: 'o2', label: 'No' },
          ],
        },
      ],
      ...overrides,
    });
  }

  it('maps PollCreated to poll_created with derived scope + question count', () => {
    const eventPoll = makePoll({ eventId: 'event-1' });
    const result = mapDomainEventToAnalytics(new PollCreated('poll-1'), eventPoll);
    expect(result!.event.name).toBe('poll_created');
    expect(result!.actorId).toBe('host-9');
    expect(result!.event.props).toEqual({
      pollId: 'poll-1',
      creatorId: 'host-9',
      questionCount: 1,
      scope: 'event',
    });

    expect(
      mapDomainEventToAnalytics(new PollCreated('poll-1'), makePoll({ groupId: 'group-1' }))!.event
        .props,
    ).toMatchObject({ scope: 'group' });
    expect(
      mapDomainEventToAnalytics(new PollCreated('poll-1'), makePoll())!.event.props,
    ).toMatchObject({ scope: 'standalone' });
  });

  it('maps PollClosed to poll_closed', () => {
    const result = mapDomainEventToAnalytics(new PollClosed('poll-1'), makePoll());
    expect(result!.event.name).toBe('poll_closed');
    expect(result!.event.props).toEqual({ pollId: 'poll-1', creatorId: 'host-9' });
  });

  it('returns null for a Poll event carrying the wrong aggregate (instanceof guard)', () => {
    expect(mapDomainEventToAnalytics(new PollCreated('poll-1'), new StubAggregate())).toBeNull();
  });
});
