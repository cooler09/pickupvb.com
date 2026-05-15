import type { EventRepository } from '@pickupvb/domain';
import { NotFoundError, isEventPosition, ValidationError } from '@pickupvb/domain';
import {
    JoinEventAsFreeAgentCommand,
    JoinEventCommand,
    JoinEventWithPositionCommand,
    LeaveEventAsFreeAgentCommand,
    LeaveEventCommand,
} from '../messages';

export class JoinEventHandler {
    constructor(private readonly repo: EventRepository) { }

    async execute({ eventId, userId }: JoinEventCommand): Promise<void> {
        const event = await this.repo.findById(eventId);
        if (!event) throw new NotFoundError('event', eventId);
        event.joinAsPlayer(userId as never);
        await this.repo.save(event);
    }
}

export class JoinEventWithPositionHandler {
    constructor(private readonly repo: EventRepository) { }

    async execute({ eventId, userId, position }: JoinEventWithPositionCommand): Promise<void> {
        if (!isEventPosition(position)) {
            throw new ValidationError(`Unknown position: ${position}`);
        }
        const event = await this.repo.findById(eventId);
        if (!event) throw new NotFoundError('event', eventId);
        event.joinAsPlayerWithPosition(userId as never, position);
        await this.repo.save(event);
    }
}

export class LeaveEventHandler {
    constructor(private readonly repo: EventRepository) { }

    async execute({ eventId, userId }: LeaveEventCommand): Promise<void> {
        const event = await this.repo.findById(eventId);
        if (!event) throw new NotFoundError('event', eventId);
        event.leave(userId as never);
        await this.repo.save(event);
    }
}

export class JoinEventAsFreeAgentHandler {
    constructor(private readonly repo: EventRepository) { }

    async execute({ eventId, userId, notes }: JoinEventAsFreeAgentCommand): Promise<void> {
        const event = await this.repo.findById(eventId);
        if (!event) throw new NotFoundError('event', eventId);
        event.joinAsFreeAgent(userId as never, notes);
        await this.repo.save(event);
    }
}

export class LeaveEventAsFreeAgentHandler {
    constructor(private readonly repo: EventRepository) { }

    async execute({ eventId, userId }: LeaveEventAsFreeAgentCommand): Promise<void> {
        const event = await this.repo.findById(eventId);
        if (!event) throw new NotFoundError('event', eventId);
        event.leaveAsFreeAgent(userId as never);
        await this.repo.save(event);
    }
}
