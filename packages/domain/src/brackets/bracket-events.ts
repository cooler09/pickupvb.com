import type { DomainEvent } from '../shared/domain-event.js';

abstract class BaseEvent implements DomainEvent {
  abstract readonly type: string;
  readonly occurredAt: Date = new Date();
  constructor(public readonly aggregateId: string) {}
}

export class BracketCreated extends BaseEvent {
  readonly type = 'bracket.created';
}

export class BracketGenerated extends BaseEvent {
  readonly type = 'bracket.generated';
  constructor(
    aggregateId: string,
    public readonly matchCount: number,
  ) {
    super(aggregateId);
  }
}

export class BracketReset extends BaseEvent {
  readonly type = 'bracket.reset';
}

export class MatchResultRecorded extends BaseEvent {
  readonly type = 'bracket.match_result_recorded';
  constructor(
    aggregateId: string,
    public readonly matchId: string,
    public readonly winnerEntryId: string,
  ) {
    super(aggregateId);
  }
}

export class MatchReset extends BaseEvent {
  readonly type = 'bracket.match_reset';
  constructor(
    aggregateId: string,
    public readonly matchId: string,
  ) {
    super(aggregateId);
  }
}

export class BracketCompleted extends BaseEvent {
  readonly type = 'bracket.completed';
}

/** Draft → active: the host published the bracket and scoring is now live (ADR 0032). */
export class BracketPublished extends BaseEvent {
  readonly type = 'bracket.published';
}

/** Completed → active: the host re-opened a finished bracket to fix a result (ADR 0032). */
export class BracketReopened extends BaseEvent {
  readonly type = 'bracket.reopened';
}
