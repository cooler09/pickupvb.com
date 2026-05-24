import { describe, expect, it } from 'vitest';
import {
  AgeGroup,
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
  type DivisionId,
  type EventId,
  type UserId,
} from '@pickupvb/domain';
import { mapDomainEventToAnalytics } from './event-analytics-mapper.js';

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
});
