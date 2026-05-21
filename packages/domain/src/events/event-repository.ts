import type { VolleyballEvent } from './volleyball-event.js';
import type {
  Surface,
  Format,
  Gender,
  SkillLevel,
  EventType,
  Visibility,
  EventStatus,
  EventPosition,
  SkillTier,
  SkillBand,
  AgeGroup,
  TeamComposition,
  PriceUnit,
  RegistrationMode,
} from './enums.js';

/**
 * Repository contract (DDD port).
 * Adapter lives in the API layer (e.g. SupabaseEventRepository).
 *
 * Note on CQRS: write-side methods (`findById`, `save`) return / accept the
 * `VolleyballEvent` aggregate. Read-side methods return denormalized read
 * models (`*Summary`, `*Detail`, `*Item`) shaped for the UI — they don't
 * round-trip through the aggregate.
 */
export interface EventRepository {
  // ---- Write side (aggregate) ----
  findById(id: string): Promise<VolleyballEvent | null>;
  save(event: VolleyballEvent): Promise<void>;

  // ---- Read side (denormalized read models) ----
  search(query: EventSearchQuery): Promise<VolleyballEventSummary[]>;
  getDetail(id: string, viewerId: string | null): Promise<EventDetailReadModel | null>;

  /**
   * Resolve a shareable short code (e.g. `ABC23XYZ`) to the underlying
   * event UUID. Returns null when no event matches.
   */
  findIdByShortCode(shortCode: string): Promise<string | null>;
  searchFollowingFeed(
    viewerId: string,
    friendIds: ReadonlyArray<string>,
    filters: FollowingFeedFilters,
  ): Promise<FollowingFeedItem[]>;
  getViewerFriends(viewerId: string): Promise<FriendProfile[]>;

  // ---- Co-host management (separate sub-resource) ----
  addCoHost(eventId: string, party: CoHostParty, addedBy: string): Promise<void>;
  removeCoHost(eventId: string, party: CoHostParty): Promise<void>;
}

// ---- Read-model shapes ----

export interface ProfileLite {
  id: string;
  /** Vanity URL token (unique, slug-shape). */
  handle: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

export interface GroupLite {
  id: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
}

export interface AttendeeLite {
  userId: string;
  joinedAt: Date;
  /** Position the attendee picked when the event uses positional sign-up. */
  position: EventPosition | null;
  /** True when over the configured count for that position (waitlist). */
  waitlist: boolean;
  profile: ProfileLite;
}

/**
 * Tournament free-agent signup row. `notes` is an optional captain-facing
 * blurb ("setter, can play Sat morning") supplied at signup.
 */
export interface FreeAgentLite {
  userId: string;
  joinedAt: Date;
  notes: string | null;
  profile: ProfileLite;
}

export interface TeamLite {
  teamId: string;
  /** Vanity URL token (unique, slug-shape). */
  slug: string;
  name: string;
  format: Format;
  captainId: string;
  /** Captain profile (for display). */
  captain: ProfileLite | null;
  /** Roster size (members count). */
  memberCount: number;
}

/** Team the viewer captains — used for the "Register a team" picker. */
export interface CaptainedTeamLite {
  id: string;
  name: string;
  format: Format;
  memberCount: number;
  /** True if this team is already registered for the event being viewed. */
  isRegistered: boolean;
}

/**
 * Read-model row for one event division (ADR 0006). Mirrors the columns
 * on `event_divisions`. Capacity-related fields are flattened.
 */
export interface DivisionLite {
  id: string;
  sortOrder: number;
  label: string;
  surface: Surface;
  format: Format;
  gender: Gender;
  skillTier: SkillTier;
  ageGroup: AgeGroup;
  tierLabel: string | null;
  teamComposition: TeamComposition;
  teamSize: number | null;
  capacityKind: 'fixed' | 'unlimited' | null;
  maxSpots: number | null;
  priceCents: number | null;
  priceUnit: PriceUnit;
  prizeText: string | null;
  prizePurseCents: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface EventDetailReadModel {
  // Base event
  id: string;
  shortCode: string;
  title: string;
  description: string;
  rules: string;
  surface: Surface;
  format: Format | null;
  gender: Gender | null;
  skillLevel: SkillLevel;
  type: EventType;
  visibility: Visibility;
  status: EventStatus;
  startsAt: Date;
  endsAt: Date;
  /** IANA timezone for the venue (e.g. `America/Los_Angeles`). Null for legacy rows. */
  timeZone: string | null;
  spotsRemaining: number | null;
  attendeeCount: number;
  /**
   * Per-position spot configuration for open-play events that use
   * positional sign-up. `null` when the host hasn't configured one.
   */
  positionRoster: Partial<Record<EventPosition, number>> | null;
  location: {
    addressLine: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  // Hosts
  hostUserId: string | null;
  hostGroupId: string | null;
  primaryHostUser: ProfileLite | null;
  primaryHostGroup: GroupLite | null;
  coHostUsers: ProfileLite[];
  coHostGroups: GroupLite[];
  // Attendees
  attendees: AttendeeLite[];
  // Tournament teams (empty array for open-play events)
  teams: TeamLite[];
  /** Tournament free agents — individuals signed up without a team. Empty for open-play. */
  freeAgents: FreeAgentLite[];
  // Viewer-specific (null viewer => no session)
  isAttending: boolean;
  /** True if the viewer is signed up as a free agent for this tournament. */
  isFreeAgent: boolean;
  canManage: boolean;
  viewerFriendIds: ReadonlyArray<string>;
  viewerHostableGroups: ReadonlyArray<{ id: string; name: string }>;
  /** Teams the viewer captains in the event's format (only meaningful for tournaments). */
  viewerCaptainedTeams: ReadonlyArray<CaptainedTeamLite>;

  // ---- ADR 0006 event-level extensions ----
  venueName: string | null;
  registrationClosesAt: Date | null;
  seriesName: string | null;
  seriesPosition: number | null;
  seriesSize: number | null;
  isFundraiser: boolean;
  fundraiserBeneficiary: string | null;
  themeTags: ReadonlyArray<string>;
  sanctioningBody: string | null;
  registrationMode: RegistrationMode;
  externalRegistrationUrl: string | null;
  externalRegistrationInstructions: string | null;
  paymentInstructions: string | null;
  paymentsOffPlatform: boolean;

  /** Divisions on this event (ADR 0006). Empty array when not yet split. */
  divisions: ReadonlyArray<DivisionLite>;
}

export interface FollowingFeedFilters {
  surface?: Surface;
  type?: EventType;
  skillLevel?: SkillLevel;
  startsAfter: Date;
  limit?: number;
}

export interface FollowingFeedItem {
  id: string;
  title: string;
  surface: Surface;
  skillLevel: SkillLevel;
  type: EventType;
  startsAt: Date;
  timeZone: string | null;
  city: string;
  region: string;
  /** Friend who is hosting this event (if any). */
  hostFriendId: string | null;
  /** Friend ids attending (excluding the host). */
  attendingFriendIds: ReadonlyArray<string>;
}

export interface FriendProfile {
  id: string;
  displayName: string;
}

export interface CoHostParty {
  userId?: string;
  groupId?: string;
}

export interface EventSearchQuery {
  /** Center point for radius search ("near me"). */
  near?: { latitude: number; longitude: number; radiusKm: number };
  surface?: Surface;
  format?: Format;
  gender?: Gender;
  skillLevel?: SkillLevel;
  type?: EventType;
  visibility?: Visibility;
  startsAfter?: Date;
  startsBefore?: Date;
  /**
   * Division-level filters (ADR 0006). When any of these are set the search
   * requires the event to have at least one matching division.
   */
  skillBand?: SkillBand;
  ageGroup?: AgeGroup;
  teamComposition?: TeamComposition;
  /** Substring match on `series_name` (case-insensitive). */
  seriesName?: string;
  registrationMode?: RegistrationMode;
  isFundraiser?: boolean;
  /** Caller's user id, used to enforce visibility (friend graph, invites). */
  viewerId?: string;
  limit?: number;
  cursor?: string;
}

/** Lightweight division row attached to each event search result. */
export interface EventSearchDivision {
  id: string;
  label: string;
  skillTier: SkillTier;
  tierLabel: string | null;
  ageGroup: AgeGroup;
  teamComposition: TeamComposition;
  priceCents: number | null;
  priceUnit: PriceUnit;
}

export interface VolleyballEventSummary {
  id: string;
  title: string;
  surface: Surface;
  format: Format | null;
  gender: Gender | null;
  skillLevel: SkillLevel;
  type: EventType;
  startsAt: Date;
  /** IANA timezone for the venue. Null for legacy rows. */
  timeZone: string | null;
  city: string;
  region: string;
  spotsRemaining: number | null;
  distanceKm: number | null;
  /** Series breadcrumb (ADR 0006). */
  seriesName: string | null;
  seriesPosition: number | null;
  seriesSize: number | null;
  isFundraiser: boolean;
  registrationMode: RegistrationMode;
  /** Divisions on this event, sorted by `sort_order`. */
  divisions: ReadonlyArray<EventSearchDivision>;
}
