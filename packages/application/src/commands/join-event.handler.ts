import type { EventRepository } from '@pickupvb/domain';
import { NotFoundError } from '@pickupvb/domain';
import { JoinEventCommand, LeaveEventCommand } from '../messages';

export class JoinEventHandler {
    constructor(private readonly repo: EventRepository) { }

    async execute({ eventId, userId }: JoinEventCommand): Promise<void> {
        const event = await this.repo.findById(eventId);
        if (!event) throw new NotFoundError('event', eventId);
        event.joinAsPlayer(userId as never);
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
