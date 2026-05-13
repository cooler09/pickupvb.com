import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import type { EventRepository } from '@pickupvb/domain';
import { GetEventByIdQuery } from '../messages';
import { EVENT_REPOSITORY } from '../tokens';

@QueryHandler(GetEventByIdQuery)
export class GetEventByIdHandler implements IQueryHandler<GetEventByIdQuery> {
    constructor(@Inject(EVENT_REPOSITORY) private readonly repo: EventRepository) { }

    async execute({ id }: GetEventByIdQuery) {
        const event = await this.repo.findById(id);
        if (!event) throw new NotFoundException('Event not found');
        return {
            id: String(event.id),
            title: event.title,
            description: event.description,
            rules: event.rules,
            surface: event.surface,
            format: event.format,
            gender: event.gender,
            skillLevel: event.skillLevel,
            type: event.type,
            visibility: event.visibility,
            status: event.status,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            spotsRemaining: event.spotsRemaining,
            attendeeCount: event.attendees.size,
            teamCount: event.teams.size,
        };
    }
}
