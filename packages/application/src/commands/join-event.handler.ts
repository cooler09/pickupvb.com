import type { AnalyticsPort, EventWriteStore } from '@pickupvb/domain';
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
    private readonly repo: EventWriteStore,
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
    private readonly repo: EventWriteStore,
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
    private readonly repo: EventWriteStore,
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
  constructor(
    private readonly repo: EventWriteStore,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({
    eventId,
    userId,
    notes,
    divisionId,
  }: JoinEventAsFreeAgentCommand): Promise<void> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    // The aggregate owns the division-existence + allowFreeAgents check and
    // now carries the chosen division on the entry (ADR 0019), so save()
    // persists it in one write path — no separate attach step.
    event.joinAsFreeAgent(UserId(userId), DivisionId(divisionId), notes);
    await this.repo.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
  }
}

export class LeaveEventAsFreeAgentHandler {
  constructor(
    private readonly repo: EventWriteStore,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ eventId, userId }: LeaveEventAsFreeAgentCommand): Promise<void> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    event.leaveAsFreeAgent(UserId(userId));
    await this.repo.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
  }
}
