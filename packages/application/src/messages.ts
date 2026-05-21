import type {
  CreateEventDto,
  DivisionInputDto,
  DivisionUpdateDto,
  SearchEventsDto,
  CreateCommunityListingDto,
  UpdateCommunityListingDto,
  SearchCommunityListingsDto,
} from '@pickupvb/types';
import type { CoHostParty, FollowingFeedFilters } from '@pickupvb/domain';

// ---- Commands -------------------------------------------------------------
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

export class JoinEventAsFreeAgentCommand {
  constructor(
    public readonly eventId: string,
    public readonly userId: string,
    /** Optional captain-facing blurb (e.g. "setter, can play Sat morning"). */
    public readonly notes: string | null,
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

// ---- Team commands -------------------------------------------------------
export class CreateTeamCommand {
  constructor(
    public readonly captainId: string,
    public readonly name: string,
    public readonly format: string,
  ) {}
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
  ) {}
}

export class AcceptTeamInviteCommand {
  constructor(
    public readonly teamId: string,
    /** Must equal the authenticated viewer; the handler enforces this. */
    public readonly userId: string,
  ) {}
}

export class RemoveTeamMemberCommand {
  constructor(
    public readonly teamId: string,
    public readonly userId: string,
    public readonly requesterId: string,
  ) {}
}

export class SetTeamExtraMembersCommand {
  constructor(
    public readonly teamId: string,
    /** Off-site player count. Must be a non-negative integer. */
    public readonly extraMemberCount: number,
    public readonly requesterId: string,
  ) {}
}

export class RegisterTeamCommand {
  constructor(
    public readonly eventId: string,
    public readonly teamId: string,
    public readonly requesterId: string,
  ) {}
}

export class WithdrawTeamCommand {
  constructor(
    public readonly eventId: string,
    public readonly teamId: string,
    public readonly requesterId: string,
  ) {}
}

// ---- Ad-hoc team registration (ADR 0007) --------------------------------
/** Input for a single roster slot when (un)registering an ad-hoc team. */
export interface AdHocRegistrationMemberInput {
  /** Linked account, when the player exists on-platform. */
  userId?: string | null;
  /** Free-text display name, used when the player has no account. */
  displayName?: string | null;
  /** Optional contact email for off-platform players. */
  email?: string | null;
}

export class RegisterAdHocTeamCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    /** Caller; becomes the registration's captain. */
    public readonly captainId: string,
    public readonly name: string,
    public readonly members: ReadonlyArray<AdHocRegistrationMemberInput>,
  ) {}
}

export class RenameAdHocTeamRegistrationCommand {
  constructor(
    public readonly registrationId: string,
    public readonly requesterId: string,
    public readonly name: string,
  ) {}
}

export class AddAdHocTeamMemberCommand {
  constructor(
    public readonly registrationId: string,
    public readonly requesterId: string,
    public readonly member: AdHocRegistrationMemberInput,
  ) {}
}

export class RemoveAdHocTeamMemberCommand {
  constructor(
    public readonly registrationId: string,
    public readonly requesterId: string,
    public readonly memberId: string,
  ) {}
}

export class WithdrawAdHocTeamRegistrationCommand {
  constructor(
    public readonly registrationId: string,
    public readonly requesterId: string,
  ) {}
}

// ---- Queries --------------------------------------------------------------
export class SearchEventsQuery {
  constructor(
    public readonly viewerId: string | null,
    public readonly filters: SearchEventsDto,
  ) {}
}

export class GetEventByIdQuery {
  constructor(public readonly id: string) {}
}

export class GetEventDetailQuery {
  constructor(
    public readonly id: string,
    public readonly viewerId: string | null,
  ) {}
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
// ---- Community listings commands ----------------------------------------
export class CreateCommunityListingCommand {
  constructor(
    public readonly submitterUserId: string,
    public readonly dto: CreateCommunityListingDto,
  ) {}
}

export class UpdateCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly requesterId: string,
    public readonly dto: UpdateCommunityListingDto,
  ) {}
}

export class DeleteCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly requesterId: string,
  ) {}
}

export class ReportCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly reporterUserId: string,
    public readonly reason: string | null,
  ) {}
}

export class HideCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly requesterId: string,
  ) {}
}

export class UnhideCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly requesterId: string,
  ) {}
}

export class ClaimCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly requesterId: string,
    public readonly eventId: string,
  ) {}
}

// ---- Community listings queries -----------------------------------------
export class SearchCommunityListingsQuery {
  constructor(
    public readonly viewerId: string | null,
    public readonly filters: SearchCommunityListingsDto,
  ) {}
}

export class GetCommunityListingDetailQuery {
  constructor(
    public readonly idOrSlug: string,
    public readonly viewerId: string | null,
  ) {}
}
