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
    EventStatus,
    EventType,
    Format,
    Gender,
    SkillLevel,
    Surface,
    Visibility,
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
        private _attendees: Set<UserId>,
        private _teams: Set<TeamId>,
        private _freeAgents: Map<UserId, string | null>,
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
        if (props.type === EventType.OpenPlay) {
            if (!props.capacity) {
                throw new InvariantViolation('Open-play events require a capacity.');
            }
            capacity = props.capacity;
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
            new Set(),
            new Set(),
            new Map(),
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
        attendees: ReadonlyArray<UserId>;
        teams: ReadonlyArray<TeamId>;
        /** Tuples of `[userId, notes]`. Notes default to `null` when absent. */
        freeAgents?: ReadonlyArray<readonly [UserId, string | null]>;
    }): VolleyballEvent {
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
            new Set(props.attendees),
            new Set(props.teams),
            new Map(props.freeAgents ?? []),
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
    get attendees(): ReadonlySet<UserId> { return this._attendees; }
    get teams(): ReadonlySet<TeamId> { return this._teams; }
    /** Free-agent signups, mapped to their optional notes blurb. */
    get freeAgents(): ReadonlyMap<UserId, string | null> { return this._freeAgents; }

    get spotsRemaining(): number | null {
        if (!this._capacity) return null;
        if (this._capacity.kind === 'unlimited') return null;
        return Math.max(0, (this._capacity.maxSpots ?? 0) - this._attendees.size);
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
        this._attendees.add(userId);
        this.raise(new SpotFilled(this.id, userId, this.spotsRemaining));
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
