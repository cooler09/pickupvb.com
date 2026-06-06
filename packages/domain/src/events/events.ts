import type { DomainEvent } from '../shared/domain-event.js';

abstract class BaseEvent implements DomainEvent {
  abstract readonly type: string;
  readonly occurredAt: Date = new Date();
  constructor(public readonly aggregateId: string) {}
}

export class EventCreated extends BaseEvent {
  readonly type = 'event.created';
}

export class EventPublished extends BaseEvent {
  readonly type = 'event.published';
}

export class EventCancelled extends BaseEvent {
  readonly type = 'event.cancelled';
  constructor(
    aggregateId: string,
    public readonly reason: string,
  ) {
    super(aggregateId);
  }
}

export class SpotFilled extends BaseEvent {
  readonly type = 'event.spot_filled';
  constructor(
    aggregateId: string,
    public readonly userId: string,
    public readonly remainingSpots: number | null,
    /** Position picked when the event uses positional sign-up; null otherwise. */
    public readonly position: string | null = null,
    /** True when this signup pushed the position past its configured count. */
    public readonly waitlist: boolean = false,
  ) {
    super(aggregateId);
  }
}

export class SpotReleased extends BaseEvent {
  readonly type = 'event.spot_released';
  constructor(
    aggregateId: string,
    public readonly userId: string,
  ) {
    super(aggregateId);
  }
}

export class WaitlistJoined extends BaseEvent {
  readonly type = 'event.waitlist_joined';
  constructor(
    aggregateId: string,
    public readonly userId: string,
    /** 1-based position in the queue at the time of joining. */
    public readonly position: number,
  ) {
    super(aggregateId);
  }
}

export class WaitlistLeft extends BaseEvent {
  readonly type = 'event.waitlist_left';
  constructor(
    aggregateId: string,
    public readonly userId: string,
  ) {
    super(aggregateId);
  }
}

export class WaitlistPromoted extends BaseEvent {
  readonly type = 'event.waitlist_promoted';
  constructor(
    aggregateId: string,
    public readonly userId: string,
    /** Spots left after the promotion landed. */
    public readonly remainingSpots: number | null,
  ) {
    super(aggregateId);
  }
}

export class TeamRegistered extends BaseEvent {
  readonly type = 'event.team_registered';
  constructor(
    aggregateId: string,
    public readonly teamId: string,
  ) {
    super(aggregateId);
  }
}

export class TeamWithdrawn extends BaseEvent {
  readonly type = 'event.team_withdrawn';
  constructor(
    aggregateId: string,
    public readonly teamId: string,
  ) {
    super(aggregateId);
  }
}

export class FreeAgentJoined extends BaseEvent {
  readonly type = 'event.free_agent_joined';
  constructor(
    aggregateId: string,
    public readonly userId: string,
  ) {
    super(aggregateId);
  }
}

export class FreeAgentLeft extends BaseEvent {
  readonly type = 'event.free_agent_left';
  constructor(
    aggregateId: string,
    public readonly userId: string,
  ) {
    super(aggregateId);
  }
}
