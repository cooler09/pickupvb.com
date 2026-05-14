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

// ---- Team commands -------------------------------------------------------
export class CreateTeamCommand {
    constructor(
        public readonly captainId: string,
        public readonly name: string,
        public readonly format: string,
    ) { }
}

export class AddTeamMemberCommand {
    constructor(
        public readonly teamId: string,
        public readonly userId: string,
        public readonly requesterId: string,
        /**
         * When true the new member is added as `active` immediately
         * (the invitee opted into auto-accept on their profile). When false
         * the slot is created as `pending` and the invitee must accept.
         */
        public readonly autoAccept: boolean,
    ) { }
}

export class AcceptTeamInviteCommand {
    constructor(
        public readonly teamId: string,
        /** Must equal the authenticated viewer; the handler enforces this. */
        public readonly userId: string,
    ) { }
}

export class RemoveTeamMemberCommand {
    constructor(
        public readonly teamId: string,
        public readonly userId: string,
        public readonly requesterId: string,
    ) { }
}

export class RegisterTeamCommand {
    constructor(
        public readonly eventId: string,
        public readonly teamId: string,
        public readonly requesterId: string,
    ) { }
}

export class WithdrawTeamCommand {
    constructor(
        public readonly eventId: string,
        public readonly teamId: string,
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
