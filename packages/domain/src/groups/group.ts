import { AggregateRoot } from '../shared/aggregate-root.js';
import { idConstructor, type Brand } from '../shared/brand.js';
import {
  ConflictError,
  InvariantViolation,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../shared/result.js';
import type { UserId } from '../events/volleyball-event.js';
import { assertCleanName, maskPublicText } from '../moderation/content-moderation.js';

export type { UserId };

export type GroupId = Brand<string, 'GroupId'>;
export const GroupId = idConstructor<'GroupId'>();

/** Membership roles, highest-privilege first. */
export type GroupRole = 'owner' | 'admin' | 'member';

/** Slug shape: 3–40 chars, lowercase alphanumerics with internal dashes only
 * (mirrors the `groups.slug` CHECK constraint). Enforced in the domain so the
 * rule can't drift between the form and any future caller. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const SLUG_ERROR = 'Slug must be 3–40 chars, lowercase letters, numbers, dashes.';
const NAME_ERROR = 'Name is required (1–80 chars).';

/** The user-editable group profile fields (everything the edit form sets; the
 * slug is immutable after creation and `createdBy` never changes). */
export interface GroupProfileEdit {
  name: string;
  description: string;
  homeCity: string | null;
  region: string | null;
  avatarUrl: string | null;
}

export interface GroupMemberChange {
  userId: UserId;
  role: GroupRole;
}

/** The delta between the aggregate's current roster and the one it was loaded
 * with — the unit `GroupRepository.saveMembers` persists via focused single-row
 * writes (not a clear-and-insert, which RLS self-leave can't satisfy). */
export interface GroupMemberDiff {
  added: GroupMemberChange[];
  removed: UserId[];
  roleChanged: GroupMemberChange[];
}

/**
 * Group / org aggregate (ADR 0021). A group is an org profile that can host
 * events; it owns its public profile and a membership roster
 * (owner/admin/member).
 *
 * The aggregate grows by increment: it models exactly the columns whose write
 * path has been migrated behind a command handler. Today that is the profile
 * (`create` / `editProfile`) and the **membership roster** (`addMember` /
 * `removeMember` / `changeMemberRole`). The follow graph and soft-delete are
 * still written by their own raw actions and are intentionally **not** modeled
 * here yet — see the migration table in ADR 0021.
 *
 * **Membership persistence:** roster mutations are persisted by
 * `GroupRepository.saveMembers` (focused per-row writes driven by `memberDiff`),
 * **not** by `save` — which writes only the profile row and would fail RLS for a
 * member's self-leave (a plain member can't UPDATE the `groups` row).
 */
export class Group extends AggregateRoot<GroupId> {
  private constructor(
    id: GroupId,
    private _slug: string,
    private _name: string,
    private _description: string,
    private _homeCity: string | null,
    private _region: string | null,
    private _avatarUrl: string | null,
    private readonly _createdBy: UserId,
    private _members: Map<UserId, GroupRole>,
    private readonly _membersBaseline: ReadonlyMap<UserId, GroupRole>,
  ) {
    super(id);
  }

  /**
   * Create a brand-new group. Validates the name + slug. The founding owner
   * `group_members` row is inserted by a DB trigger (`on_group_created`), not
   * here — `create` starts with an empty roster (the aggregate isn't the write
   * path for the founding owner).
   */
  static create(props: {
    id: GroupId;
    slug: string;
    name: string;
    createdBy: UserId;
    description?: string;
    homeCity?: string | null;
    region?: string | null;
    avatarUrl?: string | null;
  }): Group {
    const name = props.name.trim();
    Group.assertName(name);
    if (!SLUG_RE.test(props.slug)) {
      throw new ValidationError(SLUG_ERROR, { field: 'slug' });
    }
    return new Group(
      props.id,
      props.slug,
      name,
      maskPublicText(props.description?.trim() ?? ''),
      props.homeCity?.trim() || null,
      props.region?.trim() || null,
      props.avatarUrl || null,
      props.createdBy,
      new Map(),
      new Map(),
    );
  }

  /** Rehydrate a persisted `groups` row + its roster **without** re-validating.
   * The roster snapshot becomes the baseline `memberDiff` compares against. */
  static fromPersistence(props: {
    id: GroupId;
    slug: string;
    name: string;
    description: string;
    homeCity: string | null;
    region: string | null;
    avatarUrl: string | null;
    createdBy: UserId;
    members: ReadonlyArray<GroupMemberChange>;
  }): Group {
    const roster = new Map<UserId, GroupRole>(props.members.map((m) => [m.userId, m.role]));
    return new Group(
      props.id,
      props.slug,
      props.name,
      props.description,
      props.homeCity,
      props.region,
      props.avatarUrl,
      props.createdBy,
      roster,
      new Map(roster),
    );
  }

  private static assertName(name: string): void {
    if (name.length < 1 || name.length > 80) {
      throw new ValidationError(NAME_ERROR, { field: 'name' });
    }
    // Identity field — reject any profanity rather than mask it (ADR 0030).
    assertCleanName(name);
  }

  get slug(): string {
    return this._slug;
  }
  get name(): string {
    return this._name;
  }
  get description(): string {
    return this._description;
  }
  get homeCity(): string | null {
    return this._homeCity;
  }
  get region(): string | null {
    return this._region;
  }
  get avatarUrl(): string | null {
    return this._avatarUrl;
  }
  get createdBy(): UserId {
    return this._createdBy;
  }
  get members(): ReadonlyMap<UserId, GroupRole> {
    return this._members;
  }

  roleOf(userId: UserId): GroupRole | null {
    return this._members.get(userId) ?? null;
  }

  /** Apply an edit from the group settings form. Name is required (1–80);
   * the slug is immutable so it is not part of the edit. */
  editProfile(edit: GroupProfileEdit): void {
    const name = edit.name.trim();
    Group.assertName(name);
    this._name = name;
    this._description = maskPublicText(edit.description.trim());
    this._homeCity = edit.homeCity;
    this._region = edit.region;
    this._avatarUrl = edit.avatarUrl;
  }

  // ---- Membership -----------------------------------------------------------

  /** Add a member with a role. Only an owner/admin may add (mirrors RLS).
   * Adding someone who is already a member is a `ConflictError`. */
  addMember(actorId: UserId, userId: UserId, role: GroupRole): void {
    this.requireManager(actorId);
    if (this._members.has(userId)) {
      throw new ConflictError('That user is already a member of this group.');
    }
    this._members.set(userId, role);
  }

  /** Remove a member. An owner/admin may remove anyone; a member may remove
   * themselves (self-leave). Refuses to remove the **last owner** (the new
   * invariant — RLS doesn't guard this, so a group could be orphaned). */
  removeMember(actorId: UserId, userId: UserId): void {
    if (actorId !== userId) {
      this.requireManager(actorId);
    }
    const role = this._members.get(userId);
    if (role === undefined) return; // idempotent — already gone
    if (role === 'owner' && this.ownerCount() === 1) {
      throw new InvariantViolation('A group must keep at least one owner.');
    }
    this._members.delete(userId);
  }

  /** Change a member's role. Owner/admin only. Refuses to demote the last
   * owner (would orphan the group). */
  changeMemberRole(actorId: UserId, userId: UserId, role: GroupRole): void {
    this.requireManager(actorId);
    const current = this._members.get(userId);
    if (current === undefined) {
      throw new NotFoundError('group_member', userId);
    }
    if (current === 'owner' && role !== 'owner' && this.ownerCount() === 1) {
      throw new InvariantViolation('A group must keep at least one owner.');
    }
    this._members.set(userId, role);
  }

  /** Authorize a (soft) delete — owner-only (mirrors the `groups_delete` RLS).
   * A guard, not a state change: `deleted_at` isn't modeled on the aggregate
   * (a loaded `Group` is always non-deleted), so the write is a focused
   * repository op done after this check. */
  assertCanDelete(actorId: UserId): void {
    if (this._members.get(actorId) !== 'owner') {
      throw new UnauthorizedError('Only the group owner can delete it.');
    }
  }

  /** Delta between the current roster and the loaded baseline. */
  memberDiff(): GroupMemberDiff {
    const added: GroupMemberChange[] = [];
    const roleChanged: GroupMemberChange[] = [];
    const removed: UserId[] = [];
    for (const [userId, role] of this._members) {
      const before = this._membersBaseline.get(userId);
      if (before === undefined) added.push({ userId, role });
      else if (before !== role) roleChanged.push({ userId, role });
    }
    for (const userId of this._membersBaseline.keys()) {
      if (!this._members.has(userId)) removed.push(userId);
    }
    return { added, removed, roleChanged };
  }

  private requireManager(actorId: UserId): void {
    const role = this._members.get(actorId);
    if (role !== 'owner' && role !== 'admin') {
      throw new UnauthorizedError('Only a group owner or admin can manage members.');
    }
  }

  private ownerCount(): number {
    let n = 0;
    for (const role of this._members.values()) if (role === 'owner') n++;
    return n;
  }
}

export interface GroupRepository {
  findById(id: GroupId): Promise<Group | null>;
  /** INSERT a new group. The slug-uniqueness violation surfaces as a typed
   * `ConflictError`. The founding-owner row is added by the DB trigger. */
  add(group: Group): Promise<void>;
  /** UPDATE the modeled profile columns of an existing group. */
  save(group: Group): Promise<void>;
  /** Persist roster changes (`memberDiff`) via focused per-row writes — INSERT
   * added, DELETE removed, UPDATE role-changed. Leaves the `groups` row alone so
   * a member's self-leave doesn't trip the owner/admin `groups_update` policy. */
  saveMembers(group: Group): Promise<void>;
  /** Follow-graph edge writes (ADR 0021) — a surgical INSERT / DELETE on the
   * self-scoped `group_followers` table. `addFollowEdge` is idempotent. There's
   * no group-side invariant (a follow is a viewer's own edge), so these don't go
   * through the aggregate. */
  addFollowEdge(groupId: GroupId, userId: UserId): Promise<void>;
  removeFollowEdge(groupId: GroupId, userId: UserId): Promise<void>;
}
