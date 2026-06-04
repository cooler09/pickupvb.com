import { AggregateRoot } from '../shared/aggregate-root.js';
import { InvariantViolation } from '../shared/result.js';
import { assertCleanName } from '../moderation/content-moderation.js';
import type { TeamId, UserId } from '../events/volleyball-event.js';

export type { TeamId, UserId };

/** Roster slot state. Pending = invited but not yet accepted. */
export type TeamMemberStatus = 'active' | 'pending';

/**
 * Maximum roster slots a team may hold.
 *
 * A team is just a durable roster of people (ADR 0013), not a format-specific
 * entry: the same squad can field a doubles pair one weekend and a sixes
 * lineup the next, so the cap is format-independent. A generous flat cap lets
 * a club keep a deep enough bench to cover every format it enters while still
 * guarding against runaway invite spam.
 */
export const MAX_TEAM_ROSTER = 12;

/**
 * Team aggregate — a named group of people who play together.
 *
 * A team is **not** format-specific (ADR 0013): it carries no format, can
 * register for a division of any format regardless of its size, and is reusable
 * across formats and seasons. The competition's format lives on the division it
 * enters, not on the roster.
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
    private _members: Map<UserId, TeamMemberStatus>,
    private _extraMemberCount: number,
  ) {
    super(id);
  }

  /**
   * Validate inputs and produce a new `Team` with the captain as the
   * sole active member and an `extraMemberCount` of 0. Throws
   * {@link InvariantViolation} when the name is empty after trimming.
   */
  static create(props: { id: TeamId; captainId: UserId; name: string }): Team {
    const name = props.name.trim();
    if (!name) {
      throw new InvariantViolation('Team name is required.');
    }
    // Identity field — reject any profanity rather than mask it (ADR 0030).
    assertCleanName(name);
    return new Team(props.id, props.captainId, name, new Map([[props.captainId, 'active']]), 0);
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
      map,
      Math.max(0, props.extraMemberCount ?? 0),
    );
  }

  get name(): string {
    return this._name;
  }

  /** All slots regardless of status, keyed by user id. */
  get allMembers(): ReadonlyMap<UserId, TeamMemberStatus> {
    return this._members;
  }

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
    // Fixed cap, format-independent — the roster can field any format it
    // enters. See {@link MAX_TEAM_ROSTER}.
    return MAX_TEAM_ROSTER;
  }

  /**
   * Number of additional players the captain has indicated are on the team
   * but don't have site accounts. They count toward the roster cap but
   * never appear in the members map.
   */
  get extraMemberCount(): number {
    return this._extraMemberCount;
  }

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
