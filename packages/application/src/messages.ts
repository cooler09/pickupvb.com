import type {
  CreateEventDto,
  DivisionInputDto,
  DivisionUpdateDto,
  SearchEventsDto,
  CreateCommunityListingDto,
  UpdateCommunityListingDto,
  SearchCommunityListingsDto,
  CreateMediaPostDto,
  UpdateMediaPostDto,
} from '@pickupvb/types';
import type {
  CoHostParty,
  ConversationKind,
  FollowingFeedFilters,
  GroupProfileEdit,
  GroupRole,
  MessageAttachment,
  ProfileBusinessInfo,
  ProfileDetailsEdit,
  RoomKind,
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
 * Host adds an account-less team for someone without a captain account.
 * Allowed on ad-hoc (tournament) or roster (league) divisions \u2014 ADR 0033.
 * No `captain_id` is recorded; the captain's identity lives in the freeform
 * `captainDisplayName` / `captainPhone` fields.
 */
export class RegisterWalkInTeamCommand {
  constructor(
    public readonly eventId: string,
    public readonly divisionId: string,
    /**
     * The event's host (validated against `events.host_id`). The viewer's
     * permission to act is authorized at the action boundary via `canManage`,
     * so a co-host passes this as the event's host id rather than their own
     * (ADR 0033).
     */
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

// ---- Media posts commands -----------------------------------------------
export class CreateMediaPostCommand {
  constructor(
    public readonly submitterUserId: string,
    public readonly dto: CreateMediaPostDto,
  ) {}
}

export class UpdateMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
    public readonly dto: UpdateMediaPostDto,
  ) {}
}

export class RemoveMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

export class ReportMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly reporterUserId: string,
    public readonly reason: string | null,
  ) {}
}

export class HideMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

export class UnhideMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

/** Host promotes one live stream as the event's featured stream (RPC clears others). */
export class FeatureEventStreamCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

export class UnfeatureMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

export class EndLiveStreamCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

/** Cast/move the voter's award vote for a clip (one per category per event). */
export class CastVoteCommand {
  constructor(
    public readonly eventId: string,
    public readonly postId: string,
    public readonly category: string,
    public readonly voterUserId: string,
  ) {}
}

export class RetractVoteCommand {
  constructor(
    public readonly eventId: string,
    public readonly category: string,
    public readonly voterUserId: string,
  ) {}
}

// ---- Media posts queries ------------------------------------------------
export class ListEventMediaQuery {
  constructor(
    public readonly eventId: string,
    public readonly viewerId: string | null,
  ) {}
}

export class ListProfileMediaQuery {
  constructor(
    public readonly userId: string,
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

export class SetProfileAvatarCommand {
  constructor(
    public readonly userId: string,
    /** Storage URL, or `null` to clear the avatar (profile picture). */
    public readonly url: string | null,
  ) {}
}

export class UpdateBusinessInfoCommand {
  constructor(
    public readonly userId: string,
    public readonly info: ProfileBusinessInfo,
  ) {}
}

export class AddFriendCommand {
  constructor(
    public readonly viewerId: string,
    public readonly friendId: string,
  ) {}
}

export class RemoveFriendCommand {
  constructor(
    public readonly viewerId: string,
    public readonly friendId: string,
  ) {}
}

// ---- Group commands (ADR 0021) ------------------------------------------
export interface CreateGroupInput extends GroupProfileEdit {
  slug: string;
}

export class CreateGroupCommand {
  constructor(
    public readonly createdBy: string,
    public readonly input: CreateGroupInput,
  ) {}
}

export class UpdateGroupProfileCommand {
  constructor(
    public readonly groupId: string,
    public readonly edit: GroupProfileEdit,
  ) {}
}

export class SetGroupAvatarCommand {
  constructor(
    public readonly groupId: string,
    /** Storage URL, or `null` to clear the group avatar (logo). */
    public readonly url: string | null,
  ) {}
}

export class AddGroupMemberCommand {
  constructor(
    public readonly groupId: string,
    /** The caller; must be an owner/admin of the group. */
    public readonly actorId: string,
    public readonly userId: string,
    public readonly role: GroupRole,
  ) {}
}

export class RemoveGroupMemberCommand {
  constructor(
    public readonly groupId: string,
    public readonly actorId: string,
    public readonly userId: string,
  ) {}
}

export class ChangeGroupMemberRoleCommand {
  constructor(
    public readonly groupId: string,
    public readonly actorId: string,
    public readonly userId: string,
    public readonly role: GroupRole,
  ) {}
}

export class FollowGroupCommand {
  constructor(
    public readonly groupId: string,
    public readonly userId: string,
  ) {}
}

export class UnfollowGroupCommand {
  constructor(
    public readonly groupId: string,
    public readonly userId: string,
  ) {}
}

export class DeleteGroupCommand {
  constructor(
    public readonly groupId: string,
    /** The caller; must be the group owner. */
    public readonly actorId: string,
  ) {}
}

// ---- Messaging (chat) -----------------------------------------------------

/** Open (get-or-create) the single room conversation for a team/event/group. */
export class OpenConversationCommand {
  constructor(
    public readonly kind: RoomKind,
    public readonly contextId: string,
  ) {}
}

/** Open (get-or-create) the canonical 1:1 DM with another user (ADR 0028,
 * Phase 3). Anonymous callers and blocked pairs surface as `UnauthorizedError`. */
export class OpenDmCommand {
  constructor(public readonly otherUserId: string) {}
}

export class SendMessageCommand {
  constructor(
    public readonly conversationId: string,
    public readonly senderId: string,
    public readonly body: string,
    /** From the JWT `is_anonymous` claim — anonymous users cannot post. */
    public readonly isAnonymous: boolean,
    /** Already-uploaded image attachments (Phase 4); empty for text-only. */
    public readonly attachments: MessageAttachment[] = [],
    /** Drives the moderation policy (ADR 0030): `'dm'` → block-extreme only,
     * the three room kinds → mask Tier-A profanity. Defaults to the stricter
     * room treatment. */
    public readonly conversationKind: ConversationKind = 'team',
  ) {}
}

export class EditMessageCommand {
  constructor(
    public readonly messageId: string,
    public readonly actorId: string,
    public readonly body: string,
    /** Mirrors {@link SendMessageCommand.conversationKind} — drives the
     * moderation policy on the edited body. */
    public readonly conversationKind: ConversationKind = 'team',
  ) {}
}

export class DeleteMessageCommand {
  constructor(
    public readonly messageId: string,
    public readonly actorId: string,
  ) {}
}

export class ReportMessageCommand {
  constructor(
    public readonly messageId: string,
    public readonly reporterId: string,
    public readonly reason: string | null,
  ) {}
}

export class MarkConversationReadCommand {
  constructor(
    public readonly conversationId: string,
    public readonly userId: string,
  ) {}
}

export class ListMessagesQuery {
  constructor(
    public readonly conversationId: string,
    public readonly limit: number,
    public readonly before?: string,
  ) {}
}

// ─── Account deletion (ADR 0029) ─────────────────────────────────────────

export class RequestAccountDeletionCommand {
  constructor(
    public readonly userId: string,
    /** Optional free-text reason the user gives for leaving. */
    public readonly reason: string | null = null,
  ) {}
}

export class CancelAccountDeletionCommand {
  constructor(public readonly userId: string) {}
}
