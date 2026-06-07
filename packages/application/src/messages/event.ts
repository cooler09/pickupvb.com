import type {
  CreateEventDto,
  DivisionInputDto,
  DivisionUpdateDto,
  SearchEventsDto,
} from '@pickupvb/types';
import type { CoHostParty, FollowingFeedFilters } from '@pickupvb/domain';

// ---- Event commands -------------------------------------------------------
export class CreateEventCommand {
  constructor(
    public readonly hostId: string,
    public readonly dto: CreateEventDto,
  ) {}
}

export class JoinEventCommand {
  constructor(
    public readonly eventId: string,
    public readonly userId: string,
  ) {}
}

export class JoinEventWithPositionCommand {
  constructor(
    public readonly eventId: string,
    public readonly userId: string,
    public readonly position: string,
  ) {}
}

export class LeaveEventCommand {
  constructor(
    public readonly eventId: string,
    public readonly userId: string,
  ) {}
}

/** Join the capacity waitlist of a full fixed-capacity open-play event (ADR 0036). */
export class JoinWaitlistCommand {
  constructor(
    public readonly eventId: string,
    public readonly userId: string,
  ) {}
}

/** Leave the capacity waitlist (ADR 0036). */
export class LeaveWaitlistCommand {
  constructor(
    public readonly eventId: string,
    public readonly userId: string,
  ) {}
}

export class JoinEventAsFreeAgentCommand {
  constructor(
    public readonly eventId: string,
    public readonly userId: string,
    /** Optional captain-facing blurb (e.g. "setter, can play Sat morning"). */
    public readonly notes: string | null,
    /** Division the free agent is signing up for. Required — every
     * tournament has at least one (default) division. */
    public readonly divisionId: string,
  ) {}
}

export class LeaveEventAsFreeAgentCommand {
  constructor(
    public readonly eventId: string,
    public readonly userId: string,
  ) {}
}

export class AddEventCoHostCommand {
  constructor(
    public readonly eventId: string,
    public readonly party: CoHostParty,
    public readonly requesterId: string,
  ) {}
}

export class RemoveEventCoHostCommand {
  constructor(
    public readonly eventId: string,
    public readonly party: CoHostParty,
    public readonly requesterId: string,
  ) {}
}

// ---- Event division commands (ADR 0006) ---------------------------------
export class AddEventDivisionCommand {
  constructor(
    public readonly eventId: string,
    public readonly requesterId: string,
    public readonly input: DivisionInputDto,
  ) {}
}

export class UpdateEventDivisionCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    public readonly requesterId: string,
    public readonly updates: DivisionUpdateDto,
  ) {}
}

export class RemoveEventDivisionCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    public readonly requesterId: string,
  ) {}
}

// ---- Event queries --------------------------------------------------------
export class SearchEventsQuery {
  constructor(
    public readonly viewerId: string | null,
    public readonly filters: SearchEventsDto,
  ) {}
}

export class GetEventByIdQuery {
  constructor(public readonly id: string) {}
}

/**
 * Upcoming events the viewer is attending (individual RSVP), for the profile
 * hub's "Your events" section. `startsAfter` is passed in from the page
 * boundary (usually "now") so the read side stays clock-free.
 */
export class GetAttendingEventsQuery {
  constructor(
    public readonly viewerId: string,
    public readonly startsAfter: Date,
    public readonly limit?: number,
  ) {}
}

export class GetEventDetailQuery {
  constructor(
    public readonly id: string,
    public readonly viewerId: string | null,
  ) {}
}

/**
 * Viewer-independent metadata for the bracket / schedule / watch spectator
 * pages (performance audit P3 #15). Carries no viewer id — those pages resolve
 * manage rights client-side so the page stays cacheable (P2 #14).
 */
export class GetEventBracketMetaQuery {
  constructor(public readonly id: string) {}
}

export class GetFollowingFeedQuery {
  constructor(
    public readonly viewerId: string,
    public readonly friendIds: ReadonlyArray<string>,
    public readonly filters: FollowingFeedFilters,
  ) {}
}

export class GetViewerFriendsQuery {
  constructor(public readonly viewerId: string) {}
}
