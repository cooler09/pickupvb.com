import { AggregateRoot } from '../shared/aggregate-root.js';
import { InvariantViolation } from '../shared/result.js';
import { Format } from '../events/enums.js';
import { playersPerSide } from '../events/rules.js';
import type { TeamId, UserId } from '../events/volleyball-event.js';

export type { TeamId, UserId };

/**
 * Team aggregate used for tournament signup.
 * Roster size is bounded by the format the team is registering for.
 */
export class Team extends AggregateRoot<TeamId> {
    private constructor(
        id: TeamId,
        public readonly captainId: UserId,
        private _name: string,
        public readonly format: Format,
        private _members: Set<UserId>,
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
            new Set([props.captainId]),
        );
    }

    get name(): string { return this._name; }
    get members(): ReadonlySet<UserId> { return this._members; }
    get maxRoster(): number {
        // allow a couple of subs above the on-court count
        return playersPerSide(this.format) + 2;
    }

    addMember(userId: UserId): void {
        if (this._members.has(userId)) {
            throw new InvariantViolation('User is already on this team.');
        }
        if (this._members.size >= this.maxRoster) {
            throw new InvariantViolation('Team roster is full.');
        }
        this._members.add(userId);
    }

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
