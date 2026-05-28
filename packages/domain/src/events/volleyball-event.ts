import { AggregateRoot } from '../shared/aggregate-root.js';
import type { Brand } from '../shared/brand.js';
import {
  CapacityExceededError,
  ConflictError,
  InvariantViolation,
  NotFoundError,
} from '../shared/result.js';
import { Capacity } from './capacity.js';
import { Division, type DivisionId } from './division.js';
import {
  EventPosition,
  EventStatus,
  EventType,
  Format,
  Gender,
  PriceUnit,
  RegistrationMode,
  SkillLevel,
  Surface,
  TeamComposition,
  TeamRegistrationMode,
  Visibility,
  isEventPosition,
} from './enums.js';
import {
  EventCancelled,
  EventCreated,
  EventPublished,
  FreeAgentJoined,
  FreeAgentLeft,
  SpotFilled,
  SpotReleased,
  TeamRegistered,
  TeamWithdrawn,
} from './events.js';
import { Location } from './location.js';
import { assertFormatAllowedForSurface } from './rules.js';

export type EventId = Brand<string, 'EventId'>;
export type UserId = Brand<string, 'UserId'>;
export type TeamId = Brand<string, 'TeamId'>;

/**
 * Validate and copy a position roster: integers ≥ 0, at least one position
 * with a positive count, and unknown keys rejected.
 */
function normalizePositionRoster(
  raw: ReadonlyMap<EventPosition, number>,
): Map<EventPosition, number> {
  const out = new Map<EventPosition, number>();
  let total = 0;
  for (const [pos, count] of raw) {
    if (!isEventPosition(pos)) {
      throw new InvariantViolation(`Unknown volleyball position: ${String(pos)}`);
    }
    if (!Number.isInteger(count) || count < 0) {
      throw new InvariantViolation(`Position count for "${pos}" must be a non-negative integer.`);
    }
    if (count > 0) {
      out.set(pos, count);
      total += count;
    }
  }
  if (total <= 0) {
    throw new InvariantViolation('Position roster must include at least one open spot.');
  }
  return out;
}

export interface CreateEventProps {
  id: EventId;
  hostId: UserId;
  title: string;
  description: string;
  rules: string;
  surface: Surface;
  format: Format | null;
  gender: Gender | null;
  skillLevel: SkillLevel;
  type: EventType;
  visibility: Visibility;
  location: Location;
  /** IANA timezone name for the venue (e.g. `America/Los_Angeles`). */
  timeZone?: string | null;
  startsAt: Date;
  endsAt: Date;
  /** Required for OpenPlay; ignored for Tournament. */
  capacity?: Capacity;
  /**
   * Optional positional sign-up roster (open-play only). When provided,
   * players choose a position when they join (`joinAsPlayerWithPosition`).
   * Total spots = sum of values; positions with `0` are not selectable.
   */
  positionRoster?: ReadonlyMap<EventPosition, number> | null;
  /** Phase-2 extensions (ADR 0006). Optional / additive. */
  extensions?: Partial<EventExtensionsInput>;
  /** Initial divisions. May be empty; later mutations are TBD. */
  divisions?: ReadonlyArray<Division>;
}

/**
 * Additive event-level fields introduced by ADR 0006 to cover real-world
 * tournament listings (multi-day series, fundraisers, off-platform signup,
 * sanctioning bodies, etc.). All fields are optional in inputs; the
 * aggregate exposes resolved values via getters.
 */
export interface EventExtensionsInput {
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
  /**
   * When true, the host collects entry payment off-platform (cash, Venmo,
   * etc.). Platform skips Stripe Connect gating and Checkout; players still
   * RSVP on-platform. Defaults to false.
   */
  paymentsOffPlatform: boolean;
}

interface EventExtensions {
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
}

const MAX_VENUE_NAME_LEN = 200;
const MAX_SERIES_NAME_LEN = 120;
const MAX_BENEFICIARY_LEN = 200;
const MAX_THEME_TAG_LEN = 40;
const MAX_THEME_TAGS = 16;
const MAX_SANCTIONING_BODY_LEN = 60;
const MAX_URL_LEN = 2048;
const MAX_INSTRUCTIONS_LEN = 2000;

function resolveExtensions(
  input: Partial<EventExtensionsInput> | undefined,
  endsAt: Date,
): EventExtensions {
  const venueName = input?.venueName?.trim() || null;
  if (venueName && venueName.length > MAX_VENUE_NAME_LEN) {
    throw new InvariantViolation(`Venue name must be at most ${MAX_VENUE_NAME_LEN} characters.`);
  }
  const registrationClosesAt = input?.registrationClosesAt ?? null;
  if (registrationClosesAt && registrationClosesAt > endsAt) {
    throw new InvariantViolation('Registration close time must be on or before event end time.');
  }
  const seriesName = input?.seriesName?.trim() || null;
  if (seriesName && seriesName.length > MAX_SERIES_NAME_LEN) {
    throw new InvariantViolation(`Series name must be at most ${MAX_SERIES_NAME_LEN} characters.`);
  }
  const seriesPosition = input?.seriesPosition ?? null;
  const seriesSize = input?.seriesSize ?? null;
  if (seriesPosition !== null) {
    if (!Number.isInteger(seriesPosition) || seriesPosition < 1) {
      throw new InvariantViolation('Series position must be a positive integer.');
    }
  }
  if (seriesSize !== null) {
    if (!Number.isInteger(seriesSize) || seriesSize < 1) {
      throw new InvariantViolation('Series size must be a positive integer.');
    }
  }
  if (seriesPosition !== null && seriesSize !== null && seriesPosition > seriesSize) {
    throw new InvariantViolation('Series position cannot exceed series size.');
  }
  const fundraiserBeneficiary = input?.fundraiserBeneficiary?.trim() || null;
  if (fundraiserBeneficiary && fundraiserBeneficiary.length > MAX_BENEFICIARY_LEN) {
    throw new InvariantViolation(
      `Fundraiser beneficiary must be at most ${MAX_BENEFICIARY_LEN} characters.`,
    );
  }
  const themeTagsRaw = input?.themeTags ?? [];
  if (themeTagsRaw.length > MAX_THEME_TAGS) {
    throw new InvariantViolation(`Event may have at most ${MAX_THEME_TAGS} theme tags.`);
  }
  const themeTags: string[] = [];
  const seen = new Set<string>();
  for (const raw of themeTagsRaw) {
    const tag = raw.trim();
    if (!tag) continue;
    if (tag.length > MAX_THEME_TAG_LEN) {
      throw new InvariantViolation(`Theme tag "${tag}" exceeds ${MAX_THEME_TAG_LEN} characters.`);
    }
    if (seen.has(tag)) continue;
    seen.add(tag);
    themeTags.push(tag);
  }
  const sanctioningBody = input?.sanctioningBody?.trim() || null;
  if (sanctioningBody && sanctioningBody.length > MAX_SANCTIONING_BODY_LEN) {
    throw new InvariantViolation(
      `Sanctioning body must be at most ${MAX_SANCTIONING_BODY_LEN} characters.`,
    );
  }
  const registrationMode = input?.registrationMode ?? RegistrationMode.Platform;
  const externalRegistrationUrl = input?.externalRegistrationUrl?.trim() || null;
  if (externalRegistrationUrl && externalRegistrationUrl.length > MAX_URL_LEN) {
    throw new InvariantViolation(
      `External registration URL must be at most ${MAX_URL_LEN} characters.`,
    );
  }
  const externalRegistrationInstructions = input?.externalRegistrationInstructions?.trim() || null;
  if (
    externalRegistrationInstructions &&
    externalRegistrationInstructions.length > MAX_INSTRUCTIONS_LEN
  ) {
    throw new InvariantViolation(
      `External registration instructions must be at most ${MAX_INSTRUCTIONS_LEN} characters.`,
    );
  }
  if (
    registrationMode === RegistrationMode.External &&
    !externalRegistrationUrl &&
    !externalRegistrationInstructions
  ) {
    throw new InvariantViolation('External registration requires either a URL or instructions.');
  }
  const paymentInstructions = input?.paymentInstructions?.trim() || null;
  if (paymentInstructions && paymentInstructions.length > MAX_INSTRUCTIONS_LEN) {
    throw new InvariantViolation(
      `Payment instructions must be at most ${MAX_INSTRUCTIONS_LEN} characters.`,
    );
  }
  return {
    venueName,
    registrationClosesAt,
    seriesName,
    seriesPosition,
    seriesSize,
    isFundraiser: input?.isFundraiser ?? false,
    fundraiserBeneficiary,
    themeTags,
    sanctioningBody,
    registrationMode,
    externalRegistrationUrl,
    externalRegistrationInstructions,
    paymentInstructions,
    paymentsOffPlatform: input?.paymentsOffPlatform ?? false,
  };
}

/**
 * Aggregate root for a volleyball event.
 *
 * Owns all consistency rules:
 *   - Surface × format compatibility
 *   - Open-play vs tournament signup mode
 *   - Capacity enforcement
 *   - Status transitions (draft → published → cancelled/completed)
 *
 * Mutations only happen through methods. State is read-only externally.
 */
export class VolleyballEvent extends AggregateRoot<EventId> {
  private constructor(
    id: EventId,
    public readonly hostId: UserId,
    private _title: string,
    private _description: string,
    private _rules: string,
    public readonly surface: Surface,
    public readonly format: Format | null,
    public readonly gender: Gender | null,
    private _skillLevel: SkillLevel,
    public readonly type: EventType,
    private _visibility: Visibility,
    private _location: Location,
    private _timeZone: string | null,
    private _startsAt: Date,
    private _endsAt: Date,
    private _capacity: Capacity | null,
    private _status: EventStatus,
    private _attendees: Map<UserId, EventPosition | null>,
    private _teams: Set<TeamId>,
    private _freeAgents: Map<UserId, string | null>,
    private _positionRoster: Map<EventPosition, number> | null,
    private _extensions: EventExtensions,
    private _divisions: Division[],
  ) {
    super(id);
  }

  // ---- Factory ---------------------------------------------------------
  /**
   * Validate inputs and produce a new `VolleyballEvent` in `Draft` status.
   * Raises an `EventCreated` domain event on success.
   *
   * @throws {InvariantViolation} for invalid time range, missing title,
   *   missing open-play capacity, invalid payment config, or any other
   *   broken aggregate invariant.
   * @throws {ValidationError} from `assertFormatAllowedForSurface` when
   *   `surface` and `format` are incompatible.
   */
  static create(props: CreateEventProps): VolleyballEvent {
    if (props.format !== null) {
      assertFormatAllowedForSurface(props.surface, props.format);
    }

    if (props.endsAt <= props.startsAt) {
      throw new InvariantViolation('Event end time must be after start time.');
    }
    if (!props.title.trim()) {
      throw new InvariantViolation('Event title is required.');
    }

    let capacity: Capacity | null = null;
    let positionRoster: Map<EventPosition, number> | null = null;
    if (props.type === EventType.OpenPlay) {
      if (props.positionRoster && props.positionRoster.size > 0) {
        positionRoster = normalizePositionRoster(props.positionRoster);
        // Capacity is derived from the roster; persist as unlimited so
        // the DB capacity trigger doesn't reject waitlist over-fill.
        capacity = Capacity.unlimited();
      } else {
        if (!props.capacity) {
          throw new InvariantViolation('Open-play events require a capacity.');
        }
        capacity = props.capacity;
      }
    }

    const extensions = resolveExtensions(props.extensions, props.endsAt);
    const divisions = (props.divisions ?? []).slice();

    const evt = new VolleyballEvent(
      props.id,
      props.hostId,
      props.title.trim(),
      props.description.trim(),
      props.rules.trim(),
      props.surface,
      props.format,
      props.gender,
      props.skillLevel,
      props.type,
      props.visibility,
      props.location,
      props.timeZone ?? null,
      props.startsAt,
      props.endsAt,
      capacity,
      EventStatus.Draft,
      new Map(),
      new Set(),
      new Map(),
      positionRoster,
      extensions,
      divisions,
    );
    evt.assertRegistrationConfigValid();
    evt.raise(new EventCreated(evt.id));
    return evt;
  }

  /**
   * Hydrate from persistence — bypasses invariant checks and event-raising.
   * Use only from repository adapters when reading already-validated rows.
   */
  static fromPersistence(props: {
    id: EventId;
    hostId: UserId;
    title: string;
    description: string;
    rules: string;
    surface: Surface;
    format: Format | null;
    gender: Gender | null;
    skillLevel: SkillLevel;
    type: EventType;
    visibility: Visibility;
    location: Location;
    timeZone?: string | null;
    startsAt: Date;
    endsAt: Date;
    capacity: Capacity | null;
    status: EventStatus;
    attendees: ReadonlyArray<UserId> | ReadonlyArray<readonly [UserId, EventPosition | null]>;
    teams: ReadonlyArray<TeamId>;
    /** Tuples of `[userId, notes]`. Notes default to `null` when absent. */
    freeAgents?: ReadonlyArray<readonly [UserId, string | null]>;
    positionRoster?: ReadonlyMap<EventPosition, number> | null;
    extensions?: Partial<EventExtensionsInput>;
    divisions?: ReadonlyArray<Division>;
  }): VolleyballEvent {
    const attendeeEntries: Array<readonly [UserId, EventPosition | null]> = props.attendees.map(
      (a): readonly [UserId, EventPosition | null] =>
        Array.isArray(a)
          ? (a as readonly [UserId, EventPosition | null])
          : ([a as UserId, null] as const),
    );
    const roster =
      props.positionRoster && props.positionRoster.size > 0 ? new Map(props.positionRoster) : null;
    return new VolleyballEvent(
      props.id,
      props.hostId,
      props.title,
      props.description,
      props.rules,
      props.surface,
      props.format,
      props.gender,
      props.skillLevel,
      props.type,
      props.visibility,
      props.location,
      props.timeZone ?? null,
      props.startsAt,
      props.endsAt,
      props.capacity,
      props.status,
      new Map(attendeeEntries),
      new Set(props.teams),
      new Map(props.freeAgents ?? []),
      roster,
      resolveExtensions(props.extensions, props.endsAt),
      (props.divisions ?? []).slice(),
    );
  }

  // ---- Getters ---------------------------------------------------------
  get title(): string {
    return this._title;
  }
  get description(): string {
    return this._description;
  }
  get rules(): string {
    return this._rules;
  }
  get skillLevel(): SkillLevel {
    return this._skillLevel;
  }
  get visibility(): Visibility {
    return this._visibility;
  }
  get location(): Location {
    return this._location;
  }
  /** IANA timezone for the venue (e.g. `America/Los_Angeles`). May be null for legacy rows. */
  get timeZone(): string | null {
    return this._timeZone;
  }
  get startsAt(): Date {
    return this._startsAt;
  }
  get endsAt(): Date {
    return this._endsAt;
  }
  get status(): EventStatus {
    return this._status;
  }
  get capacity(): Capacity | null {
    return this._capacity;
  }
  /** Map of attendee → chosen position (null when the event isn't positional). */
  get attendees(): ReadonlyMap<UserId, EventPosition | null> {
    return this._attendees;
  }
  /** Configured per-position counts for open-play. `null` when not positional. */
  get positionRoster(): ReadonlyMap<EventPosition, number> | null {
    return this._positionRoster;
  }
  get teams(): ReadonlySet<TeamId> {
    return this._teams;
  }
  /** Free-agent signups, mapped to their optional notes blurb. */
  get freeAgents(): ReadonlyMap<UserId, string | null> {
    return this._freeAgents;
  }
  /** Divisions on this event. Empty when the event has not been split yet. */
  get divisions(): ReadonlyArray<Division> {
    return this._divisions;
  }
  get venueName(): string | null {
    return this._extensions.venueName;
  }
  get registrationClosesAt(): Date | null {
    return this._extensions.registrationClosesAt;
  }
  get seriesName(): string | null {
    return this._extensions.seriesName;
  }
  get seriesPosition(): number | null {
    return this._extensions.seriesPosition;
  }
  get seriesSize(): number | null {
    return this._extensions.seriesSize;
  }
  get isFundraiser(): boolean {
    return this._extensions.isFundraiser;
  }
  get fundraiserBeneficiary(): string | null {
    return this._extensions.fundraiserBeneficiary;
  }
  get themeTags(): ReadonlyArray<string> {
    return this._extensions.themeTags;
  }
  get sanctioningBody(): string | null {
    return this._extensions.sanctioningBody;
  }
  get registrationMode(): RegistrationMode {
    return this._extensions.registrationMode;
  }
  get externalRegistrationUrl(): string | null {
    return this._extensions.externalRegistrationUrl;
  }
  get externalRegistrationInstructions(): string | null {
    return this._extensions.externalRegistrationInstructions;
  }
  get paymentInstructions(): string | null {
    return this._extensions.paymentInstructions;
  }
  get paymentsOffPlatform(): boolean {
    return this._extensions.paymentsOffPlatform;
  }

  /** Total spots — derived from positionRoster when set, else from capacity. */
  get totalSpots(): number | null {
    if (this._positionRoster) {
      let sum = 0;
      for (const n of this._positionRoster.values()) sum += n;
      return sum;
    }
    if (!this._capacity) return null;
    if (this._capacity.kind === 'unlimited') return null;
    return this._capacity.maxSpots;
  }

  get spotsRemaining(): number | null {
    if (this._positionRoster) {
      const total = this.totalSpots ?? 0;
      return Math.max(0, total - this._attendees.size);
    }
    if (!this._capacity) return null;
    if (this._capacity.kind === 'unlimited') return null;
    return Math.max(0, (this._capacity.maxSpots ?? 0) - this._attendees.size);
  }

  /** Number of attendees currently signed up for a given position. */
  attendeesAtPosition(position: EventPosition): number {
    let n = 0;
    for (const p of this._attendees.values()) if (p === position) n += 1;
    return n;
  }

  /** True once the event's start time is in the past. Used to close signups. */
  hasStarted(now: Date = new Date()): boolean {
    return this._startsAt.getTime() <= now.getTime();
  }

  // ---- Behaviors -------------------------------------------------------
  publish(): void {
    if (this._status !== EventStatus.Draft) {
      throw new InvariantViolation('Only draft events can be published.');
    }
    this._status = EventStatus.Published;
    this.raise(new EventPublished(this.id));
  }

  cancel(reason: string): void {
    if (this._status === EventStatus.Cancelled || this._status === EventStatus.Completed) {
      throw new InvariantViolation('Event is already finalized.');
    }
    this._status = EventStatus.Cancelled;
    this.raise(new EventCancelled(this.id, reason));
  }

  /**
   * Open-play signup.
   *
   * @throws {InvariantViolation} if the event is not OpenPlay, uses
   *   position-based signup, is not Published, or has already started.
   * @throws {ConflictError} if the user is already signed up.
   * @throws {CapacityExceededError} if the event is at capacity.
   */
  joinAsPlayer(userId: UserId): void {
    if (this.type !== EventType.OpenPlay) {
      throw new InvariantViolation('Tournaments require team signup.');
    }
    if (this._positionRoster) {
      throw new InvariantViolation('This event uses positional sign-up — pick a position.');
    }
    if (this._status !== EventStatus.Published) {
      throw new InvariantViolation('Event is not open for signups.');
    }
    if (this.hasStarted()) {
      throw new InvariantViolation('Event has already started; signups are closed.');
    }
    if (this._attendees.has(userId)) {
      throw new ConflictError('User has already joined this event.', {
        eventId: this.id,
        userId,
      });
    }
    if (this._capacity && !this._capacity.hasRoom(this._attendees.size)) {
      throw new CapacityExceededError('Event is full.', { eventId: this.id });
    }
    this._attendees.set(userId, null);
    this.raise(new SpotFilled(this.id, userId, this.spotsRemaining));
  }

  /**
   * Open-play signup at a specific position. Available only when the host
   * configured a `positionRoster`. Over-fill is allowed (waitlist style):
   * we don't reject when the position is full, we just flag the event.
   *
   * @throws {InvariantViolation} if the event is not OpenPlay, has no
   *   position roster, is not Published, has already started, or the
   *   requested position is not part of this event.
   * @throws {ConflictError} if the user is already signed up.
   */
  joinAsPlayerWithPosition(userId: UserId, position: EventPosition): void {
    if (this.type !== EventType.OpenPlay) {
      throw new InvariantViolation('Tournaments require team signup.');
    }
    if (!this._positionRoster) {
      throw new InvariantViolation('This event does not use positional sign-up.');
    }
    if (this._status !== EventStatus.Published) {
      throw new InvariantViolation('Event is not open for signups.');
    }
    if (this.hasStarted()) {
      throw new InvariantViolation('Event has already started; signups are closed.');
    }
    const target = this._positionRoster.get(position) ?? 0;
    if (target <= 0) {
      throw new InvariantViolation('That position is not part of this event.');
    }
    if (this._attendees.has(userId)) {
      throw new ConflictError('User has already joined this event.', {
        eventId: this.id,
        userId,
      });
    }
    const filled = this.attendeesAtPosition(position);
    const waitlist = filled >= target;
    this._attendees.set(userId, position);
    this.raise(new SpotFilled(this.id, userId, this.spotsRemaining, position, waitlist));
  }

  /**
   * Remove an open-play signup.
   *
   * @throws {NotFoundError} if the user is not currently signed up.
   */
  leave(userId: UserId): void {
    if (!this._attendees.delete(userId)) {
      throw new NotFoundError('attendee', userId, 'User is not signed up for this event.');
    }
    this.raise(new SpotReleased(this.id, userId));
  }

  /**
   * Tournament signup.
   *
   * @throws {InvariantViolation} if the event is not a Tournament, is not
   *   Published, or has already started.
   * @throws {ConflictError} if the team is already registered.
   */
  registerTeam(teamId: TeamId): void {
    if (this.type !== EventType.Tournament) {
      throw new InvariantViolation('Open-play events require player signup.');
    }
    if (this._status !== EventStatus.Published) {
      throw new InvariantViolation('Event is not open for signups.');
    }
    if (this.hasStarted()) {
      throw new InvariantViolation('Event has already started; team registration is closed.');
    }
    if (this._teams.has(teamId)) {
      throw new ConflictError('Team is already registered.', {
        eventId: this.id,
        teamId,
      });
    }
    this._teams.add(teamId);
    this.raise(new TeamRegistered(this.id, teamId));
  }

  /**
   * Tournament withdraw.
   *
   * @throws {NotFoundError} if the team is not currently registered.
   */
  withdrawTeam(teamId: TeamId): void {
    if (!this._teams.delete(teamId)) {
      throw new NotFoundError('team', String(teamId), 'Team is not registered for this event.');
    }
    this.raise(new TeamWithdrawn(this.id, teamId));
  }

  /**
   * Free-agent signup for a tournament. Lets a player advertise that
   * they want to be picked up by a team that's short. Independent of
   * team registration — a captain can be both.
   *
   * @throws {InvariantViolation} if the event is not a Tournament, is not
   *   Published, has already started, the division does not accept
   *   free agents, or notes exceed 280 characters.
   * @throws {NotFoundError} if `divisionId` does not belong to this event.
   * @throws {ConflictError} if the user is already signed up as a free agent.
   */
  joinAsFreeAgent(userId: UserId, divisionId: DivisionId, notes: string | null): void {
    if (this.type !== EventType.Tournament) {
      throw new InvariantViolation('Free-agent signup is only for tournaments.');
    }
    if (this._status !== EventStatus.Published) {
      throw new InvariantViolation('Event is not open for signups.');
    }
    if (this.hasStarted()) {
      throw new InvariantViolation('Event has already started; free-agent signup is closed.');
    }
    const division = this._divisions.find((d) => d.id === divisionId);
    if (!division) {
      throw new NotFoundError('division', String(divisionId), 'Division not found on this event.');
    }
    if (!division.allowFreeAgents) {
      throw new InvariantViolation('This division does not accept free-agent signups.');
    }
    if (this._freeAgents.has(userId)) {
      throw new ConflictError('User is already signed up as a free agent.', {
        eventId: this.id,
        userId,
      });
    }
    const trimmed = notes?.trim();
    if (trimmed && trimmed.length > 280) {
      throw new InvariantViolation('Free-agent notes are limited to 280 characters.');
    }
    this._freeAgents.set(userId, trimmed && trimmed.length > 0 ? trimmed : null);
    this.raise(new FreeAgentJoined(this.id, userId));
  }

  /**
   * Remove a free-agent signup.
   *
   * @throws {NotFoundError} if the user is not currently signed up as a
   *   free agent.
   */
  leaveAsFreeAgent(userId: UserId): void {
    if (!this._freeAgents.delete(userId)) {
      throw new NotFoundError(
        'free_agent',
        String(userId),
        'User is not signed up as a free agent for this event.',
      );
    }
    this.raise(new FreeAgentLeft(this.id, userId));
  }

  changeVisibility(visibility: Visibility): void {
    this._visibility = visibility;
  }

  // ---- Divisions (ADR 0006) -------------------------------------------
  /** Append a new division. Caller is responsible for unique ids. */
  addDivision(division: Division): void {
    if (this._divisions.some((d) => d.id === division.id)) {
      throw new ConflictError('Division with this id already exists on the event.', {
        eventId: this.id,
        divisionId: division.id,
      });
    }
    this._divisions.push(division);
    this.assertRegistrationConfigValid();
  }

  /** Replace an existing division by id. */
  updateDivision(division: Division): void {
    const idx = this._divisions.findIndex((d) => d.id === division.id);
    if (idx === -1) {
      throw new NotFoundError('division', String(division.id));
    }
    this._divisions[idx] = division;
    this.assertRegistrationConfigValid();
  }

  /** Remove a division by id. */
  removeDivision(divisionId: Division['id']): void {
    const idx = this._divisions.findIndex((d) => d.id === divisionId);
    if (idx === -1) {
      throw new NotFoundError('division', String(divisionId));
    }
    this._divisions.splice(idx, 1);
  }

  /**
   * ADR 0012 + ADR 0016 — canonical registration-config matrix, applied
   * **per division**. Each division carries its own
   * `teamRegistrationMode`; the rules are:
   *
   *   1. Open-play events must have every division at `mode = null`
   *      (individual signup only). No team-led divisions allowed at all.
   *   2. A division with `mode ∈ {ad_hoc, roster}` requires a non-solo
   *      `team_composition`. When the division charges money
   *      (`priceCents > 0`) it must also be `priceUnit === per_team`:
   *      the captain pays for the team and the platform does not split a
   *      captain's payment across teammates. **Free divisions
   *      (`priceCents === 0` or `null`) skip the price-unit check** —
   *      with no money to route, per-player vs. per-team is a meaningless
   *      distinction. The write boundary normalizes the unit to
   *      `per_team` in that case so persisted rows stay coherent.
   *   3. A division with `mode === null` requires `TeamComposition.Solo`.
   *      When charging money it must be `priceUnit === per_player`; free
   *      divisions skip the check (mirrored to Rule 2). The write
   *      boundary normalizes the unit to `per_player`.
   *   4. `payments_off_platform` does not relax any of the above —
   *      off-platform changes who handles the money, not what shape
   *      of registration the platform accepts. (The price-unit relaxation
   *      in Rules 2 & 3 is keyed on `priceCents`, not on whether payments
   *      are off-platform, so a paid off-platform division still must
   *      pick the unit that matches its mode.)
   *
   * Invoked from {@link create} and from division mutations so a bad
   * combination can't sneak in by adding a division later.
   */
  private assertRegistrationConfigValid(): void {
    // P1 #3 — Open-play events are per-product-brief single-division
    // and individual-only. The per-division loop below already catches
    // a non-solo composition or non-null `teamRegistrationMode`
    // (Rules 1 + 3); this top-level guard adds the count check the
    // per-division loop can't express.
    if (this.type === EventType.OpenPlay && this._divisions.length > 1) {
      throw new InvariantViolation(
        `Open-play events must have at most one division (got ${this._divisions.length}). Change the event type to tournament or remove the extra divisions.`,
      );
    }

    for (const d of this._divisions) {
      const mode = d.teamRegistrationMode;
      const isTeamLed = mode === TeamRegistrationMode.AdHoc || mode === TeamRegistrationMode.Roster;
      const isIndividual = mode === null;
      const composition = d.teamComposition;
      const priceUnit = d.priceUnit;
      const isFree = (d.priceCents ?? 0) <= 0;

      // Rule 1: open-play forbids any team-led division.
      if (this.type === EventType.OpenPlay && !isIndividual) {
        throw new InvariantViolation(
          `Open-play events must use individual signup on every division. Division "${d.label}" has team registration mode "${mode}" — set it to "none" or change the event type to tournament.`,
        );
      }

      // Rule 1c (P2 #5): open-play has no free-agent pool by product
      // design — RSVP is individual; everyone is effectively their own
      // free agent. Force `allow_free_agents = false` so the dead code
      // path can't accidentally light up if the column gets toggled by
      // a future host-tools panel or an importer.
      if (this.type === EventType.OpenPlay && d.allowFreeAgents) {
        throw new InvariantViolation(
          `Open-play events do not have a free-agent pool. Division "${d.label}" has allow_free_agents = true — set it to false (the field is only meaningful on tournament and league divisions).`,
        );
      }

      // Rule 1b (P1 #1 scaffolding): leagues are pre-defined rostered
      // squads. Every league division must use `roster` mode (no ad-hoc
      // pickup teams, no individual signup) and a non-solo composition.
      if (this.type === EventType.League) {
        if (mode !== TeamRegistrationMode.Roster) {
          throw new InvariantViolation(
            `League events require roster-based team registration on every division. Division "${d.label}" has team registration mode "${mode ?? 'none'}" — set it to "roster".`,
          );
        }
        if (composition === TeamComposition.Solo) {
          throw new InvariantViolation(
            `League events cannot use solo composition. Division "${d.label}" must use team, pair_draw, or partner_required.`,
          );
        }
      }

      // Rule 2: team-led division requires team composition.
      // The per-team price-unit constraint only kicks in for paid divisions.
      if (isTeamLed) {
        if (composition === TeamComposition.Solo) {
          throw new InvariantViolation(
            `Team-registered divisions cannot use solo composition. Division "${d.label}" must use team, pair_draw, or partner_required.`,
          );
        }
        if (!isFree && priceUnit === PriceUnit.PerPlayer) {
          throw new InvariantViolation(
            `Team-registered divisions require per-team pricing. Division "${d.label}" is priced per-player — the captain pays for the team. Switch the division to per-team pricing or set the division's team registration mode to "none".`,
          );
        }
      }

      // Rule 3: individual-signup division requires solo composition.
      // The per-player price-unit constraint only kicks in for paid divisions.
      if (isIndividual) {
        if (composition !== TeamComposition.Solo) {
          throw new InvariantViolation(
            `Individual-signup divisions must use solo composition. Division "${d.label}" has team composition "${composition}" — set the division's team registration mode to ad_hoc/roster or switch the composition to solo.`,
          );
        }
        if (!isFree && priceUnit === PriceUnit.PerTeam) {
          throw new InvariantViolation(
            `Individual-signup divisions cannot use per-team pricing. Division "${d.label}" must be priced per-player, or set the division's team registration mode to ad_hoc/roster.`,
          );
        }
      }
    }
  }
}
