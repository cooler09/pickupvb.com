import type { CreateEventDto, SearchEventsDto } from '@pickupvb/types';
import type { CoHostParty, FollowingFeedFilters } from '@pickupvb/domain';

// ---- Commands -------------------------------------------------------------
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

export class LeaveEventCommand {
    constructor(
        public readonly eventId: string,
        public readonly userId: string,
    ) { }
}

export class AddEventCoHostCommand {
    constructor(
        public readonly eventId: string,
        public readonly party: CoHostParty,
        public readonly requesterId: string,
    ) { }
}

export class RemoveEventCoHostCommand {
    constructor(
        public readonly eventId: string,
        public readonly party: CoHostParty,
        public readonly requesterId: string,
    ) { }
}

// ---- Queries --------------------------------------------------------------
export class SearchEventsQuery {
    constructor(
        public readonly viewerId: string | null,
        public readonly filters: SearchEventsDto,
    ) { }
}

export class GetEventByIdQuery {
    constructor(public readonly id: string) { }
}

export class GetEventDetailQuery {
    constructor(
        public readonly id: string,
        public readonly viewerId: string | null,
    ) { }
}

export class GetFollowingFeedQuery {
    constructor(
        public readonly viewerId: string,
        public readonly friendIds: ReadonlyArray<string>,
        public readonly filters: FollowingFeedFilters,
    ) { }
}

export class GetViewerFriendsQuery {
    constructor(public readonly viewerId: string) { }
}
