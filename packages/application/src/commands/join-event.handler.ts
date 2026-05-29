import type { AnalyticsPort, EventRepository } from '@pickupvb/domain';
import {
  DivisionId,
  NotFoundError,
  UserId,
  isEventPosition,
  ValidationError,
} from '@pickupvb/domain';
import { dispatchAnalyticsOutbox } from '../analytics/dispatch-outbox.js';
import {
  JoinEventAsFreeAgentCommand,
  JoinEventCommand,
  JoinEventWithPositionCommand,
  LeaveEventAsFreeAgentCommand,
  LeaveEventCommand,
} from '../messages';

export class JoinEventHandler {
  constructor(
    private readonly repo: EventRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ eventId, userId }: JoinEventCommand): Promise<void> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    event.joinAsPlayer(UserId(userId));
    await this.repo.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
  }
}

export class JoinEventWithPositionHandler {
  constructor(
    private readonly repo: EventRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ eventId, userId, position }: JoinEventWithPositionCommand): Promise<void> {
    if (!isEventPosition(position)) {
      throw new ValidationError(`Unknown position: ${position}`);
    }
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    event.joinAsPlayerWithPosition(UserId(userId), position);
    await this.repo.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
  }
}

export class LeaveEventHandler {
  constructor(
    private readonly repo: EventRepository,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ eventId, userId }: LeaveEventCommand): Promise<void> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    event.leave(UserId(userId));
    await this.repo.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
  }
}

export class JoinEventAsFreeAgentHandler {
  constructor(private readonly repo: EventRepository) {}

  async execute({
    eventId,
    userId,
    notes,
    divisionId,
  }: JoinEventAsFreeAgentCommand): Promise<void> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    // Aggregate owns division existence + allowFreeAgents check.
    event.joinAsFreeAgent(UserId(userId), DivisionId(divisionId), notes);
    await this.repo.save(event);
    // Persist the division pick via dedicated port (aggregate's
    // `_freeAgents` map has no slot for division_id).
    await this.repo.attachFreeAgentToDivision(eventId, userId, divisionId);
  }
}

export class LeaveEventAsFreeAgentHandler {
  constructor(private readonly repo: EventRepository) {}

  async execute({ eventId, userId }: LeaveEventAsFreeAgentCommand): Promise<void> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    event.leaveAsFreeAgent(UserId(userId));
    await this.repo.save(event);
  }
}
