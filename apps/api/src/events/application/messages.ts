import type { CreateEventDto, SearchEventsDto } from '@pickupvb/types';

export class CreateEventCommand {
    constructor(
        public readonly hostId: string,
        public readonly dto: CreateEventDto,
    ) { }
}

export class JoinEventCommand {
    constructor(
        public readonly eventId: string,
        public readonly userId: string,
    ) { }
}

export class SearchEventsQuery {
    constructor(
        public readonly viewerId: string | null,
        public readonly filters: SearchEventsDto,
    ) { }
}

export class GetEventByIdQuery {
    constructor(public readonly id: string) { }
}
