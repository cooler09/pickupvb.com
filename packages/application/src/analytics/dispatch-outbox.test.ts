import { describe, expect, it } from 'vitest';
import {
  AggregateRoot,
  AgeGroup,
  BracketCompleted,
  Capacity,
  Division,
  EventType,
  Format,
  Gender,
  Location,
  PriceUnit,
  SkillLevel,
  SkillTier,
  Surface,
  TeamComposition,
  Visibility,
  VolleyballEvent,
  type AnalyticsEvent,
  type AnalyticsPort,
  type AnalyticsTraits,
  type DivisionId,
  type DomainEvent,
  type EventId,
  type UserId,
} from '@pickupvb/domain';
import { dispatchAnalyticsOutbox } from './dispatch-outbox.js';

// Records every capture so we can assert what reached the port. `dispatch`
// is fail-quiet, so a test for "captured nothing" is meaningful.
function fakeAnalytics(opts?: { throwOnCapture?: boolean }): {
  port: AnalyticsPort;
  captures: AnalyticsEvent[];
} {
  const captures: AnalyticsEvent[] = [];
  const port: AnalyticsPort = {
    identify(_actorId: string, _traits: AnalyticsTraits): void {},
    capture(event: AnalyticsEvent): void {
      if (opts?.throwOnCapture) throw new Error('port boom');
      captures.push(event);
    },
    async shutdown(): Promise<void> {},
  };
  return { port, captures };
}

/** A non-`VolleyballEvent` aggregate the dispatcher must drain fail-quiet. */
class StubAggregate extends AggregateRoot<string> {
  constructor() {
    super('stub-1');
  }
  emit(e: DomainEvent): void {
    this.raise(e);
  }
}

function makeOpenPlayEvent(): VolleyballEvent {
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
    location: Location.create({
      addressLine: '1 Main',
      city: 'Long Beach',
      region: 'CA',
      postalCode: '90802',
      country: 'US',
      latitude: 33.77,
      longitude: -118.19,
    }),
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
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
        priceCents: 0,
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
  evt.pullEvents(); // drain create/publish — focus on the join below.
  return evt;
}

describe('dispatchAnalyticsOutbox', () => {
  it('captures a taxonomied VolleyballEvent event (SpotFilled -> event_joined)', () => {
    const evt = makeOpenPlayEvent();
    evt.joinAsPlayer('alice' as UserId); // raises SpotFilled
    const { port, captures } = fakeAnalytics();

    dispatchAnalyticsOutbox(evt, port);

    expect(captures).toHaveLength(1);
    expect(captures[0]?.name).toBe('event_joined');
  });

  it('drains any aggregate fail-quiet — Bracket events flow through but capture nothing', () => {
    // The whole point of P2-4: a Bracket (or any non-event aggregate) now goes
    // through the same outbox. Its events have no taxonomy entry, so nothing is
    // captured — but the buffer is still drained and no error escapes.
    const stub = new StubAggregate();
    stub.emit(new BracketCompleted('bracket-1'));
    stub.emit(new BracketCompleted('bracket-1'));
    expect(stub.pendingEvents).toHaveLength(2);
    const { port, captures } = fakeAnalytics();

    expect(() => dispatchAnalyticsOutbox(stub, port)).not.toThrow();

    expect(captures).toHaveLength(0);
    expect(stub.pendingEvents).toHaveLength(0); // pullEvents() drained the buffer
  });

  it('swallows a throwing port so analytics can never break a request', () => {
    const evt = makeOpenPlayEvent();
    evt.joinAsPlayer('bob' as UserId);
    const { port } = fakeAnalytics({ throwOnCapture: true });

    expect(() => dispatchAnalyticsOutbox(evt, port)).not.toThrow();
  });
});
