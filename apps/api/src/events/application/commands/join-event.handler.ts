import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import type { EventRepository } from '@pickupvb/domain';
import { JoinEventCommand } from '../messages';
import { EVENT_REPOSITORY } from '../tokens';

@CommandHandler(JoinEventCommand)
export class JoinEventHandler implements ICommandHandler<JoinEventCommand, void> {
    constructor(@Inject(EVENT_REPOSITORY) private readonly repo: EventRepository) { }

    async execute({ eventId, userId }: JoinEventCommand): Promise<void> {
        const event = await this.repo.findById(eventId);
        if (!event) throw new NotFoundException('Event not found');
        event.joinAsPlayer(userId as never);
        await this.repo.save(event);
    }
}
