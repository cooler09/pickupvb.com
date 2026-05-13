import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
    Capacity,
    EventType,
    Location,
    VolleyballEvent,
    type EventRepository,
} from '@pickupvb/domain';
import { CreateEventCommand } from '../messages';
import { EVENT_REPOSITORY } from '../tokens';

@CommandHandler(CreateEventCommand)
export class CreateEventHandler implements ICommandHandler<CreateEventCommand, { id: string }> {
    constructor(@Inject(EVENT_REPOSITORY) private readonly repo: EventRepository) { }

    async execute({ hostId, dto }: CreateEventCommand): Promise<{ id: string }> {
        const id = randomUUID() as never;

        let capacity: Capacity | undefined;
        if (dto.type === EventType.OpenPlay && dto.capacity) {
            capacity =
                dto.capacity.kind === 'unlimited'
                    ? Capacity.unlimited()
                    : Capacity.fixed(dto.capacity.maxSpots);
        }

        const event = VolleyballEvent.create({
            id,
            hostId: hostId as never,
            title: dto.title,
            description: dto.description,
            rules: dto.rules,
            surface: dto.surface,
            format: dto.format,
            gender: dto.gender,
            skillLevel: dto.skillLevel,
            type: dto.type,
            visibility: dto.visibility,
            location: Location.create(dto.location),
            startsAt: dto.startsAt,
            endsAt: dto.endsAt,
            ...(capacity ? { capacity } : {}),
        });
        event.publish();

        await this.repo.save(event);
        return { id: String(event.id) };
    }
}
