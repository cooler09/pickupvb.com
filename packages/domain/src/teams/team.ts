import { AggregateRoot } from '../shared/aggregate-root.js';
import { InvariantViolation } from '../shared/result.js';
import { Format } from '../events/enums.js';
import { playersPerSide } from '../events/rules.js';
import type { TeamId, UserId } from '../events/volleyball-event.js';

export type { TeamId, UserId };

/** Roster slot state. Pending = invited but not yet accepted. */
export type TeamMemberStatus = 'active' | 'pending';

/**
 * Team aggregate used for tournament signup.
 *
 * Members move through two states: `pending` (the captain has invited them
 * but they haven't accepted yet) and `active` (they're really on the roster).
 * The captain themselves is always `active`. Both states count toward the
 * roster cap so a captain can't over-invite.
 *
 * Tournament eligibility, member counts, etc. should consider only
 * `activeMembers`. Persistence and admin views can use `allMembers`.
 */
export class Team extends AggregateRoot<TeamId> {
    private constructor(
        id: TeamId,
        public readonly captainId: UserId,
        private _name: string,
        public readonly format: Format,
        private _members: Map<UserId, TeamMemberStatus>,
        private _extraMemberCount: number,
    ) {
        super(id);
    }

    static create(props: {
        id: TeamId;
        captainId: UserId;
        name: string;
        format: Format;
    }): Team {
        if (!props.name.trim()) {
            throw new InvariantViolation('Team name is required.');
        }
        return new Team(
            props.id,
            props.captainId,
            props.name.trim(),
            props.format,
            new Map([[props.captainId, 'active']]),
            0,
        );
    }

    /**
     * Rebuilds a `Team` from already-persisted state. Skips the invariants
     * that the public factory enforces — callers (repositories) are trusted
     * to only pass through what was previously saved.
     */
    static rehydrate(props: {
        id: TeamId;
        captainId: UserId;
        name: string;
        format: Format;
        members: ReadonlyMap<UserId, TeamMemberStatus>;
        extraMemberCount?: number;
    }): Team {
        const map = new Map(props.members);
        // Captain is always active and always present.
        map.set(props.captainId, 'active');
        return new Team(
            props.id,
            props.captainId,
            props.name,
            props.format,
            map,
            Math.max(0, props.extraMemberCount ?? 0),
        );
    }

    get name(): string { return this._name; }

    /** All slots regardless of status, keyed by user id. */
    get allMembers(): ReadonlyMap<UserId, TeamMemberStatus> { return this._members; }

    /** Confirmed players — the only ones eligible for tournament play. */
    get activeMembers(): ReadonlySet<UserId> {
        const out = new Set<UserId>();
        for (const [id, s] of this._members) if (s === 'active') out.add(id);
        return out;
    }

    /** Players the captain has invited who haven't accepted yet. */
    get pendingMembers(): ReadonlySet<UserId> {
        const out = new Set<UserId>();
        for (const [id, s] of this._members) if (s === 'pending') out.add(id);
        return out;
    }

    get maxRoster(): number {
        // allow a couple of subs above the on-court count
        return playersPerSide(this.format) + 2;
    }

    /**
     * Number of additional players the captain has indicated are on the team
     * but don't have site accounts. They count toward the roster cap but
     * never appear in the members map.
     */
    get extraMemberCount(): number { return this._extraMemberCount; }

    /** Total slots used: tracked members (active + pending) + extras. */
    get rosterSize(): number {
        return this._members.size + this._extraMemberCount;
    }

    /**
     * Update the off-site player count. Captain-only at the application layer.
     */
    setExtraMemberCount(n: number): void {
        if (!Number.isInteger(n) || n < 0) {
            throw new InvariantViolation('Off-site player count must be a non-negative integer.');
        }
        if (this._members.size + n > this.maxRoster) {
            throw new InvariantViolation('Roster cap exceeded for that count.');
        }
        this._extraMemberCount = n;
    }

    /**
     * Captain invites a player. If the invitee opted into auto-accept (their
     * profile preference) the slot is created as `active` immediately;
     * otherwise it's `pending` until they accept.
     */
    inviteMember(userId: UserId, autoAccept: boolean): void {
        if (this._members.has(userId)) {
            throw new InvariantViolation('User is already on this team.');
        }
        if (this._members.size + this._extraMemberCount >= this.maxRoster) {
            throw new InvariantViolation('Team roster is full.');
        }
        this._members.set(userId, autoAccept ? 'active' : 'pending');
    }

    /** Invitee confirms a pending invite. No-op if already active. */
    acceptInvite(userId: UserId): void {
        const status = this._members.get(userId);
        if (!status) {
            throw new InvariantViolation('No invite found for this user.');
        }
        if (status === 'active') return;
        this._members.set(userId, 'active');
    }

    /** Removes a member regardless of status (covers leave + decline + kick). */
    removeMember(userId: UserId): void {
        if (userId === this.captainId) {
            throw new InvariantViolation('Captain cannot leave the team.');
        }
        this._members.delete(userId);
    }
}

export interface TeamRepository {
    findById(id: TeamId): Promise<Team | null>;
    save(team: Team): Promise<void>;
}
