import type {
  CreateEventDto,
  DivisionInputDto,
  DivisionUpdateDto,
  SearchEventsDto,
  CreateCommunityListingDto,
  UpdateCommunityListingDto,
  SearchCommunityListingsDto,
} from '@pickupvb/types';
import type {
  CoHostParty,
  FollowingFeedFilters,
  ProfileBusinessInfo,
  ProfileDetailsEdit,
  StoredThemePreference,
} from '@pickupvb/domain';

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
    /**
     * Division the captain is registering the team into. Required because
     * `event_teams.division_id` is NOT NULL and multi-division events need
     * the captain's choice (the `fill_default_division_id` trigger only
     * covers single-division events).
     */
    public readonly divisionId: string,
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
    /**
     * When true, treat the caller as the event host acting on behalf of
     * a walk-in team and bypass the "one team per captain per division"
     * uniqueness check. The handler still verifies the caller actually
     * is the host before honoring the flag — clients can't bypass the
     * check by lying.
     */
    public readonly actingAsHost: boolean = false,
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

// ---- Walk-in team registration (ADR 0017) -------------------------------
/**
 * Host registers a same-day team at the table for someone without a
 * captain account. Allowed only on `team_registration_mode = 'ad_hoc'`
 * divisions. The acting host is validated against `events.host_id`; no
 * `captain_id` is recorded \u2014 the captain's identity lives in the
 * freeform `captainDisplayName` / `captainPhone` fields.
 */
export class RegisterWalkInTeamCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    /** Caller; must be the event host. */
    public readonly hostId: string,
    public readonly name: string,
    public readonly captainDisplayName: string,
    public readonly captainPhone: string | null,
    public readonly members: ReadonlyArray<AdHocRegistrationMemberInput>,
  ) {}
}

/**
 * Host marks a walk-in registration paid in cash / Venmo / off-platform.
 * Refuses to touch captain or host-proxy rows (they have a real captain
 * account and a Stripe path or the existing `hostMarkTeamRegistrationPaid`
 * flow). Optional `note` captures reconciliation context.
 */
export class MarkWalkInPaidCashCommand {
  constructor(
    public readonly registrationId: string,
    public readonly requesterId: string,
    public readonly note: string | null,
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

export class ApproveCommunityListingClaimCommand {
  constructor(
    public readonly listingId: string,
    public readonly approverId: string,
  ) {}
}

export class RejectCommunityListingClaimCommand {
  constructor(
    public readonly listingId: string,
    public readonly rejecterId: string,
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

// ---- User profile commands (ADR 0020) -----------------------------------
export class UpdateProfileCommand {
  constructor(
    public readonly userId: string,
    /** Already-normalized editable fields (trimming / handle normalization
     * happen at the web boundary). The handler defends invariants. */
    public readonly details: ProfileDetailsEdit,
  ) {}
}

export class ChangeHandleCommand {
  constructor(
    public readonly userId: string,
    /** Already lower-cased / trimmed; the aggregate validates the shape and
     * the DB unique constraint surfaces as `ConflictError` on save. */
    public readonly handle: string,
  ) {}
}

export class SetProfileThemeCommand {
  constructor(
    public readonly userId: string,
    /** `'system'` is a device-only cookie choice and never reaches here. */
    public readonly theme: StoredThemePreference,
  ) {}
}

export class SetProfileHeroImageCommand {
  constructor(
    public readonly userId: string,
    /** Storage URL, or `null` to clear the hero image. */
    public readonly url: string | null,
  ) {}
}

export class UpdateBusinessInfoCommand {
  constructor(
    public readonly userId: string,
    public readonly info: ProfileBusinessInfo,
  ) {}
}
