import type { VolleyballEvent } from './volleyball-event.js';
import type {
    Surface,
    Format,
    Gender,
    SkillLevel,
    EventType,
    Visibility,
    EventStatus,
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
    spotsRemaining: number | null;
    attendeeCount: number;
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
    /** Caller's user id, used to enforce visibility (friend graph, invites). */
    viewerId?: string;
    limit?: number;
    cursor?: string;
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
    city: string;
    region: string;
    spotsRemaining: number | null;
    distanceKm: number | null;
}
