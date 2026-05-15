import { randomUUID } from 'node:crypto';
import {
    Capacity,
    EventType,
    Location,
    VolleyballEvent,
    isEventPosition,
    type EventPosition,
    type EventRepository,
} from '@pickupvb/domain';
import { CreateEventCommand } from '../messages';

/**
 * Pure handler — takes a port (EventRepository), returns a result.
 * No DI framework, no decorators, no HTTP coupling.
 */
export class CreateEventHandler {
    constructor(private readonly repo: EventRepository) { }

    async execute({ hostId, dto }: CreateEventCommand): Promise<{ id: string }> {
        const id = randomUUID() as never;

        let positionRoster: Map<EventPosition, number> | null = null;
        if (
            dto.type === EventType.OpenPlay
            && dto.positionRoster
            && Object.values(dto.positionRoster).some((n) => (n ?? 0) > 0)
        ) {
            positionRoster = new Map();
            for (const [pos, count] of Object.entries(dto.positionRoster)) {
                if (!isEventPosition(pos)) continue;
                if (typeof count === 'number' && count > 0) positionRoster.set(pos, count);
            }
        }

        let capacity: Capacity | undefined;
        if (dto.type === EventType.OpenPlay && !positionRoster && dto.capacity) {
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
            format: dto.format ?? null,
            gender: dto.gender ?? null,
            skillLevel: dto.skillLevel,
            type: dto.type,
            visibility: dto.visibility,
            location: Location.create(dto.location),
            startsAt: dto.startsAt,
            endsAt: dto.endsAt,
            ...(capacity ? { capacity } : {}),
            ...(positionRoster ? { positionRoster } : {}),
        });
        event.publish();

        await this.repo.save(event);
        return { id: String(event.id) };
    }
}
