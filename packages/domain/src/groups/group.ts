import { AggregateRoot } from '../shared/aggregate-root.js';
import { idConstructor, type Brand } from '../shared/brand.js';
import { ValidationError } from '../shared/result.js';
import type { UserId } from '../events/volleyball-event.js';

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

/**
 * Group / org aggregate (ADR 0021). A group is an org profile that can host
 * events; it owns its public profile, a membership roster (owner/admin/member),
 * and a follow graph.
 *
 * The aggregate grows by increment: it models exactly the columns whose write
 * path has been migrated behind a command handler. Today that is the profile
 * edit form (`create` / `editProfile`). The membership roster, the follow
 * graph, and soft-delete are still written by their own raw actions and are
 * intentionally **not** modeled here yet — see the migration table in ADR 0021.
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
  ) {
    super(id);
  }

  /**
   * Create a brand-new group. Validates the name + slug. The founding owner
   * `group_members` row is inserted by a DB trigger (`on_group_created`), not
   * here — the aggregate doesn't model the roster in this increment.
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
      props.description?.trim() ?? '',
      props.homeCity?.trim() || null,
      props.region?.trim() || null,
      props.avatarUrl || null,
      props.createdBy,
    );
  }

  /** Rehydrate a persisted `groups` row **without** re-validating. */
  static fromPersistence(props: {
    id: GroupId;
    slug: string;
    name: string;
    description: string;
    homeCity: string | null;
    region: string | null;
    avatarUrl: string | null;
    createdBy: UserId;
  }): Group {
    return new Group(
      props.id,
      props.slug,
      props.name,
      props.description,
      props.homeCity,
      props.region,
      props.avatarUrl,
      props.createdBy,
    );
  }

  private static assertName(name: string): void {
    if (name.length < 1 || name.length > 80) {
      throw new ValidationError(NAME_ERROR, { field: 'name' });
    }
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

  /** Apply an edit from the group settings form. Name is required (1–80);
   * the slug is immutable so it is not part of the edit. */
  editProfile(edit: GroupProfileEdit): void {
    const name = edit.name.trim();
    Group.assertName(name);
    this._name = name;
    this._description = edit.description.trim();
    this._homeCity = edit.homeCity;
    this._region = edit.region;
    this._avatarUrl = edit.avatarUrl;
  }
}

export interface GroupRepository {
  findById(id: GroupId): Promise<Group | null>;
  /** INSERT a new group. The slug-uniqueness violation surfaces as a typed
   * `ConflictError`. The founding-owner row is added by the DB trigger. */
  add(group: Group): Promise<void>;
  /** UPDATE the modeled profile columns of an existing group. */
  save(group: Group): Promise<void>;
}
