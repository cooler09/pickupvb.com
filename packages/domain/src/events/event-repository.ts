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
 * Event persistence + read contracts (DDD ports), segregated by responsibility
 * (architecture audit P2-2, ISP). The former monolithic `EventRepository`
 * conflated four concerns; it now survives only as the composed union
 * `EventRepository` (below) that the Supabase adapter implements — but each
 * handler depends on the narrow slice it actually uses:
 *
 * - {@link EventWriteStore} — write-side aggregate persistence (`findById`,
 *   `save`). These return / accept the `VolleyballEvent` aggregate; pure
 *   authorization reads (load-then-check) use `findById` too.
 * - {@link EventReadModels} — denormalized CQRS read projections (`search`,
 *   `getDetail`, `findIdByShortCode`) shaped for the UI; they don't round-trip
 *   through the aggregate.
 * - {@link EventMembershipStore} — focused sub-resource mutations that aren't
 *   aggregate state (co-host edges, league roster forfeit flag).
 *
 * NOTE (architecture audit P2-2): the friend-graph reads `getViewerFriends` /
 * `searchFollowingFeed` already moved to the dedicated `SocialGraphQueries`
 * port (packages/domain/src/users) — they were never the event aggregate's
 * concern. NOTE (ADR 0019): the former `attachTeamToDivision` /
 * `attachFreeAgentToDivision` aggregate-sidestep methods were removed; the
 * `VolleyballEvent` aggregate now owns the division on each team / free-agent
 * entry, so `save(event)` persists the join in one write path.
 */
export interface EventWriteStore {
  findById(id: string): Promise<VolleyballEvent | null>;
  save(event: VolleyballEvent): Promise<void>;
}

/** Denormalized read projections shaped for the UI (CQRS read side). */
export interface EventReadModels {
  search(query: EventSearchQuery): Promise<VolleyballEventSummary[]>;
  getDetail(id: string, viewerId: string | null): Promise<EventDetailReadModel | null>;

  /**
   * Upcoming events the given user is attending as an individual (an
   * `event_participants` row with role `attendee`), soonest-first. Same rich
   * {@link VolleyballEventSummary} projection as {@link search} so the profile
   * hub can render them with the shared event card; `distanceKm` is always null
   * (no location context on the hub). `opts.startsAfter` is supplied by the
   * caller (the page boundary) so the read side stays clock-free.
   */
  listAttending(
    userId: string,
    opts?: { startsAfter?: Date; limit?: number },
  ): Promise<VolleyballEventSummary[]>;

  /**
   * Lightweight, viewer-independent metadata projection for the bracket /
   * schedule / watch spectator pages (performance audit P3 #15) — avoids the
   * ~14-query `getDetail` read model when only event type, divisions, host,
   * and title are needed. Returns null when no event matches.
   */
  getBracketMeta(id: string): Promise<EventBracketMetaReadModel | null>;

  /**
   * Resolve a shareable short code (e.g. `ABC23XYZ`) to the underlying
   * event UUID. Returns null when no event matches.
   */
  findIdByShortCode(shortCode: string): Promise<string | null>;
}

/**
 * Focused mutations on event sub-resources that are not part of the
 * `VolleyballEvent` aggregate's own state — co-host edges and the league
 * roster forfeit flag. Kept off {@link EventWriteStore} so command handlers
 * that only touch a sub-resource don't depend on aggregate persistence.
 */
export interface EventMembershipStore {
  // ---- Co-host management (separate sub-resource) ----
  addCoHost(eventId: string, party: CoHostParty, addedBy: string): Promise<void>;
  removeCoHost(eventId: string, party: CoHostParty): Promise<void>;

  /**
   * Mark (or unmark) a league team as forfeited, keyed on its
   * `event_team_entries.id` (ADR 0034). Works for both rostered and
   * host-added (team-less `walk_in`) entries. Pass `null` to clear the
   * flag (reinstate). RLS gates the write to the event host — the handler
   * doesn't duplicate the check.
   */
  setLeagueEntryForfeited(entryId: string, forfeitedAt: Date | null): Promise<void>;
}

/**
 * Composed contract implemented by the Supabase adapter (one class still backs
 * all three slices). Handlers should depend on the narrowest slice they use,
 * not this union — it exists for the adapter `implements` clause and for test
 * fakes (`Pick<EventRepository, 'findById' | 'save'>`).
 */
export interface EventRepository extends EventWriteStore, EventReadModels, EventMembershipStore {}

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
  /** Runner-up (2nd place), set by the host. Null when not recorded. */
  runnerUp: { label: string } | null;
  /** Third place, set by the host. Null when not recorded. */
  thirdPlace: { label: string } | null;
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
  registrationCloseOffsetMinutes: number | null;
  registrationOverride: 'open' | 'closed' | null;
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

/**
 * Lightweight, viewer-independent event projection for the bracket / schedule /
 * watch spectator pages (performance audit P3 #15). These pages consume only a
 * handful of metadata fields + divisions; the full {@link EventDetailReadModel}
 * (~14 queries) is wasteful here. `canManage` is intentionally **absent** — the
 * spectator pages resolve viewer capabilities client-side so the page itself
 * stays viewer-independent and cacheable (performance audit P2 #14).
 */
export interface EventBracketMetaReadModel {
  id: string;
  title: string;
  type: EventType;
  status: EventStatus;
  /** IANA timezone for the venue (e.g. `America/Los_Angeles`). Null for legacy rows. */
  timeZone: string | null;
  /** Primary host user id — the payout destination and the manage gate's anchor. */
  hostUserId: string | null;
  /** Hosting group, if any — used to resolve owner/admin manage rights client-side. */
  hostGroupId: string | null;
  /** Divisions on this event (ADR 0006). Empty array when not yet split. */
  divisions: ReadonlyArray<DivisionLite>;
}

// FollowingFeedFilters / FollowingFeedItem / FriendProfile moved to
// packages/domain/src/users/social-graph-queries.ts (architecture audit P2-2).

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
  /** Public hero image URL for the discovery-card thumbnail; null when unset. */
  heroImageUrl: string | null;
  /** Divisions on this event, sorted by `sort_order`. */
  divisions: ReadonlyArray<EventSearchDivision>;
}
