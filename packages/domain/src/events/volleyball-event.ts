import { AggregateRoot } from '../shared/aggregate-root.js';
import type { Brand } from '../shared/brand.js';
import {
    CapacityExceededError,
    ConflictError,
    InvariantViolation,
    NotFoundError,
} from '../shared/result.js';
import { Capacity } from './capacity.js';
import {
    EventPosition,
    EventStatus,
    EventType,
    Format,
    Gender,
    SkillLevel,
    Surface,
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
        private _startsAt: Date,
        private _endsAt: Date,
        private _capacity: Capacity | null,
        private _status: EventStatus,
        private _attendees: Map<UserId, EventPosition | null>,
        private _teams: Set<TeamId>,
        private _freeAgents: Map<UserId, string | null>,
        private _positionRoster: Map<EventPosition, number> | null,
    ) {
        super(id);
    }

    // ---- Factory ---------------------------------------------------------
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
            props.startsAt,
            props.endsAt,
            capacity,
            EventStatus.Draft,
            new Map(),
            new Set(),
            new Map(),
            positionRoster,
        );
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
        startsAt: Date;
        endsAt: Date;
        capacity: Capacity | null;
        status: EventStatus;
        attendees: ReadonlyArray<UserId> | ReadonlyArray<readonly [UserId, EventPosition | null]>;
        teams: ReadonlyArray<TeamId>;
        /** Tuples of `[userId, notes]`. Notes default to `null` when absent. */
        freeAgents?: ReadonlyArray<readonly [UserId, string | null]>;
        positionRoster?: ReadonlyMap<EventPosition, number> | null;
    }): VolleyballEvent {
        const attendeeEntries: Array<readonly [UserId, EventPosition | null]> = props.attendees.map(
            (a): readonly [UserId, EventPosition | null] =>
                Array.isArray(a) ? (a as readonly [UserId, EventPosition | null]) : ([a as UserId, null] as const),
        );
        const roster = props.positionRoster && props.positionRoster.size > 0
            ? new Map(props.positionRoster)
            : null;
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
            props.startsAt,
            props.endsAt,
            props.capacity,
            props.status,
            new Map(attendeeEntries),
            new Set(props.teams),
            new Map(props.freeAgents ?? []),
            roster,
        );
    }

    // ---- Getters ---------------------------------------------------------
    get title(): string { return this._title; }
    get description(): string { return this._description; }
    get rules(): string { return this._rules; }
    get skillLevel(): SkillLevel { return this._skillLevel; }
    get visibility(): Visibility { return this._visibility; }
    get location(): Location { return this._location; }
    get startsAt(): Date { return this._startsAt; }
    get endsAt(): Date { return this._endsAt; }
    get status(): EventStatus { return this._status; }
    get capacity(): Capacity | null { return this._capacity; }
    /** Map of attendee → chosen position (null when the event isn't positional). */
    get attendees(): ReadonlyMap<UserId, EventPosition | null> { return this._attendees; }
    /** Configured per-position counts for open-play. `null` when not positional. */
    get positionRoster(): ReadonlyMap<EventPosition, number> | null { return this._positionRoster; }
    get teams(): ReadonlySet<TeamId> { return this._teams; }
    /** Free-agent signups, mapped to their optional notes blurb. */
    get freeAgents(): ReadonlyMap<UserId, string | null> { return this._freeAgents; }

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

    /** Open-play signup. */
    joinAsPlayer(userId: UserId): void {
        if (this.type !== EventType.OpenPlay) {
            throw new InvariantViolation('Tournaments require team signup.');
        }
        if (this._positionRoster) {
            throw new InvariantViolation(
                'This event uses positional sign-up — pick a position.',
            );
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

    leave(userId: UserId): void {
        if (!this._attendees.delete(userId)) {
            throw new NotFoundError('attendee', userId, 'User is not signed up for this event.');
        }
        this.raise(new SpotReleased(this.id, userId));
    }

    /** Tournament signup. */
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

    /** Tournament withdraw. */
    withdrawTeam(teamId: TeamId): void {
        if (!this._teams.delete(teamId)) {
            throw new NotFoundError(
                'team',
                String(teamId),
                'Team is not registered for this event.',
            );
        }
        this.raise(new TeamWithdrawn(this.id, teamId));
    }

    /**
     * Free-agent signup for a tournament. Lets a player advertise that
     * they want to be picked up by a team that's short. Independent of
     * team registration — a captain can be both.
     */
    joinAsFreeAgent(userId: UserId, notes: string | null): void {
        if (this.type !== EventType.Tournament) {
            throw new InvariantViolation('Free-agent signup is only for tournaments.');
        }
        if (this._status !== EventStatus.Published) {
            throw new InvariantViolation('Event is not open for signups.');
        }
        if (this.hasStarted()) {
            throw new InvariantViolation('Event has already started; free-agent signup is closed.');
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

    /** Remove a free-agent signup. */
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
}
