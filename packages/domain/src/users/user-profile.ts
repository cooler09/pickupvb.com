import { AggregateRoot } from '../shared/aggregate-root.js';
import { InvariantViolation } from '../shared/result.js';
import type { UserId } from '../events/volleyball-event.js';

export type { UserId };

/**
 * User profile aggregate. Authentication itself lives in Supabase Auth;
 * this aggregate owns the public-facing profile + friend graph.
 */
export class UserProfile extends AggregateRoot<UserId> {
    private constructor(
        id: UserId,
        private _displayName: string,
        private _homeCity: string | null,
        private _friends: Set<UserId>,
    ) {
        super(id);
    }

    static create(props: { id: UserId; displayName: string; homeCity?: string }): UserProfile {
        if (!props.displayName.trim()) {
            throw new InvariantViolation('Display name is required.');
        }
        return new UserProfile(
            props.id,
            props.displayName.trim(),
            props.homeCity?.trim() ?? null,
            new Set(),
        );
    }

    get displayName(): string { return this._displayName; }
    get homeCity(): string | null { return this._homeCity; }
    get friends(): ReadonlySet<UserId> { return this._friends; }

    rename(displayName: string): void {
        if (!displayName.trim()) {
            throw new InvariantViolation('Display name is required.');
        }
        this._displayName = displayName.trim();
    }

    addFriend(friendId: UserId): void {
        if (friendId === this.id) {
            throw new InvariantViolation('Cannot friend yourself.');
        }
        this._friends.add(friendId);
    }

    removeFriend(friendId: UserId): void {
        this._friends.delete(friendId);
    }

    isFriendsWith(friendId: UserId): boolean {
        return this._friends.has(friendId);
    }
}

export interface UserRepository {
    findById(id: UserId): Promise<UserProfile | null>;
    save(user: UserProfile): Promise<void>;
}
