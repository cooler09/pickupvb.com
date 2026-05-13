import type { DomainEvent } from '../shared/domain-event.js';

abstract class BaseEvent implements DomainEvent {
    abstract readonly type: string;
    readonly occurredAt: Date = new Date();
    constructor(public readonly aggregateId: string) { }
}

export class EventCreated extends BaseEvent {
    readonly type = 'event.created';
}

export class EventPublished extends BaseEvent {
    readonly type = 'event.published';
}

export class EventCancelled extends BaseEvent {
    readonly type = 'event.cancelled';
    constructor(aggregateId: string, public readonly reason: string) {
        super(aggregateId);
    }
}

export class SpotFilled extends BaseEvent {
    readonly type = 'event.spot_filled';
    constructor(
        aggregateId: string,
        public readonly userId: string,
        public readonly remainingSpots: number | null,
    ) {
        super(aggregateId);
    }
}

export class SpotReleased extends BaseEvent {
    readonly type = 'event.spot_released';
    constructor(aggregateId: string, public readonly userId: string) {
        super(aggregateId);
    }
}

export class TeamRegistered extends BaseEvent {
    readonly type = 'event.team_registered';
    constructor(aggregateId: string, public readonly teamId: string) {
        super(aggregateId);
    }
}
