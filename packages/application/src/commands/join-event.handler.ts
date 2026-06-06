import type { AnalyticsPort, EventWriteStore } from '@pickupvb/domain';
import {
  DivisionId,
  NotFoundError,
  UserId,
  WaitlistPromoted,
  isEventPosition,
  ValidationError,
} from '@pickupvb/domain';
import { dispatchAnalyticsOutbox } from '../analytics/dispatch-outbox.js';
import {
  JoinEventAsFreeAgentCommand,
  JoinEventCommand,
  JoinEventWithPositionCommand,
  JoinWaitlistCommand,
  LeaveEventAsFreeAgentCommand,
  LeaveEventCommand,
  LeaveWaitlistCommand,
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

  /**
   * Leaving may auto-promote the head of the capacity waitlist (ADR 0036). The
   * promoted user id is returned so the caller can notify them
   * (`event.waitlist.promoted`) — read from the raised events before `save()`
   * drains them.
   */
  async execute({
    eventId,
    userId,
  }: LeaveEventCommand): Promise<{ promotedUserId: string | null }> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    event.leave(UserId(userId));
    const promoted = event.pendingEvents.find(
      (e): e is WaitlistPromoted => e instanceof WaitlistPromoted,
    );
    await this.repo.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
    return { promotedUserId: promoted ? promoted.userId : null };
  }
}

export class JoinWaitlistHandler {
  constructor(
    private readonly repo: EventWriteStore,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ eventId, userId }: JoinWaitlistCommand): Promise<void> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    event.joinWaitlist(UserId(userId));
    await this.repo.save(event);
    if (this.analytics) dispatchAnalyticsOutbox(event, this.analytics);
  }
}

export class LeaveWaitlistHandler {
  constructor(
    private readonly repo: EventWriteStore,
    private readonly analytics?: AnalyticsPort,
  ) {}

  async execute({ eventId, userId }: LeaveWaitlistCommand): Promise<void> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundError('event', eventId);
    event.leaveWaitlist(UserId(userId));
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
