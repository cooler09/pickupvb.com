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
  TeamRegistrationMode,
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

  /**
   * Idempotently attach a team to a division on the event. Sidesteps the
   * `VolleyballEvent` aggregate because its `_teams` set carries only
   * team ids — it has no place for the division id, and `event_teams`
   * requires `division_id` (NOT NULL). Use this from the registration
   * handler instead of `event.registerTeam(...)` + `save(event)`.
   */
  attachTeamToDivision(eventId: string, teamId: string, divisionId: string): Promise<void>;

  /**
   * Idempotently attach a free agent to a division on the event. Sidesteps
   * the `VolleyballEvent` aggregate for the same reason as
   * `attachTeamToDivision`: its `_freeAgents` map stores only userId → notes
   * and has no place for the chosen division. Use this from
   * `JoinEventAsFreeAgentHandler` after `event.joinAsFreeAgent(...)` + save.
   */
  attachFreeAgentToDivision(eventId: string, userId: string, divisionId: string): Promise<void>;

  /**
   * Mark (or unmark) a rostered team in a league division as forfeited.
   * Targets `event_team_entries` where `source = 'roster'`. Pass `null`
   * to clear the flag (reinstate). RLS gates the write to the event
   * host — the handler doesn't duplicate the check.
   */
  setRosterTeamForfeited(
    divisionId: string,
    teamId: string,
    forfeitedAt: Date | null,
  ): Promise<void>;
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
  /** Division the free agent is signed up for. Null on legacy rows. */
  divisionId: string | null;
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
  /** Division the team is registered for. Null on legacy rows. */
  divisionId: string | null;
  /**
   * Sidecar per-team payment state (ADR 0007, Bundle 4). Null when the
   * team owes nothing or hasn't started checkout — UI infers "owed" from
   * the division's price_unit + price_cents and shows the Pay button when
   * `payment === null || payment.status !== 'paid'`.
   */
  payment: {
    status: 'none' | 'pending' | 'paid' | 'refunded';
    amountPaidCents: number | null;
  } | null;
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
  /** When false, the free-agent panel hides this division from sign-ups. */
  allowFreeAgents: boolean;
  /**
   * ADR 0016 — per-division team paradigm. `null` = individual signup;
   * `'ad_hoc'` = captain assembles a throwaway roster; `'roster'` =
   * captain registers an existing persistent team.
   */
  teamRegistrationMode: TeamRegistrationMode | null;
  /**
   * Winning team for this division, set by the host after play wraps up.
   * Null when no winner has been recorded yet. The label is the team's
   * display name (roster-mode `teams.name` or ad-hoc
   * `event_team_registrations.name`).
   */
  winner: { label: string; recordedAt: Date } | null;
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
  /**
   * Count of attendees per position, including waitlisted entries. Empty
   * when no attendees have a position set. Mirrors the shape of
   * `positionRoster` so the UI can render `filled / target` per slot
   * without re-walking the attendees array on the consumer side.
   */
  filledByPosition: Partial<Record<EventPosition, number>>;
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
  surface: Surface;
  format: Format | null;
  gender: Gender | null;
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
