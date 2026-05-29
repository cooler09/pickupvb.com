import { AggregateRoot } from '../shared/aggregate-root.js';
import { InvariantViolation, ValidationError } from '../shared/result.js';
import type { UserId } from '../events/volleyball-event.js';

export type { UserId };

/** Volleyball positions a player lists on their profile (raw enum strings;
 * the web boundary validates them against the position enum). */
export interface ProfilePositions {
  primary: string | null;
  secondary: string | null;
  tertiary: string | null;
}

/** Bare social handles (no leading `@`, no URL prefix) + a website URL.
 * Normalization happens at the web boundary; the aggregate just stores them. */
export interface ProfileSocialHandles {
  instagram: string | null;
  tiktok: string | null;
  twitter: string | null;
  facebook: string | null;
  youtube: string | null;
  website: string | null;
}

/** The user-editable details set by the profile edit form (everything except
 * the handle, which has its own uniqueness-constrained mutator). */
export interface ProfileDetailsEdit {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  homeCity: string | null;
  positions: ProfilePositions;
  socialHandles: ProfileSocialHandles;
  autoAcceptTeamInvites: boolean;
  showProBadge: boolean;
}

/** Buyer-side business fields rendered on printable receipts. */
export interface ProfileBusinessInfo {
  businessName: string | null;
  businessAddress: string | null;
  taxId: string | null;
}

/** Persisted theme preference. `'system'` is a device-only choice (cookie) and
 * is intentionally never stored on the profile — the column is `light | dark`. */
export type StoredThemePreference = 'light' | 'dark';

/** Handle shape: 3–65 chars, lowercase alphanumerics with internal dashes
 * only (no leading/trailing dash). Enforced in the domain so the rule can't
 * drift between the form and any future caller. */
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,63}[a-z0-9]$/;
const HANDLE_ERROR = 'Use 3–65 lowercase letters, numbers, or dashes (no leading/trailing dash).';

const emptyPositions = (): ProfilePositions => ({
  primary: null,
  secondary: null,
  tertiary: null,
});
const emptySocialHandles = (): ProfileSocialHandles => ({
  instagram: null,
  tiktok: null,
  twitter: null,
  facebook: null,
  youtube: null,
  website: null,
});

/**
 * User profile aggregate (ADR 0020). Authentication itself lives in Supabase
 * Auth; this aggregate owns the user-editable `public.profiles` row + the
 * friend graph.
 *
 * The aggregate grows by increment: it models exactly the columns whose write
 * path has been migrated behind a command handler. Today that is the profile
 * edit form (`editDetails`) + the handle editor (`changeHandle`). The
 * `theme_preference` / `hero_image_url` / `business_*` columns are still
 * written raw by their actions and are intentionally **not** modeled here yet
 * — see the migration table in ADR 0020.
 */
export class UserProfile extends AggregateRoot<UserId> {
  private constructor(
    id: UserId,
    private _displayName: string,
    private _firstName: string | null,
    private _lastName: string | null,
    private _homeCity: string | null,
    private _handle: string,
    private _positions: ProfilePositions,
    private _socialHandles: ProfileSocialHandles,
    private _autoAcceptTeamInvites: boolean,
    private _showProBadge: boolean,
    private _themePreference: string,
    private _heroImageUrl: string | null,
    private _businessInfo: ProfileBusinessInfo,
    private _friends: Set<UserId>,
  ) {
    super(id);
  }

  /**
   * Create a brand-new profile (onboarding). Validates the display name and
   * handle. Use `fromPersistence` to rehydrate an existing DB row.
   */
  static create(props: {
    id: UserId;
    displayName: string;
    handle: string;
    homeCity?: string | null;
  }): UserProfile {
    const displayName = props.displayName.trim();
    if (!displayName) {
      throw new ValidationError('Display name is required.');
    }
    if (!HANDLE_RE.test(props.handle)) {
      throw new ValidationError(HANDLE_ERROR);
    }
    return new UserProfile(
      props.id,
      displayName,
      null,
      null,
      props.homeCity?.trim() || null,
      props.handle,
      emptyPositions(),
      emptySocialHandles(),
      false,
      false,
      'light',
      null,
      { businessName: null, businessAddress: null, taxId: null },
      new Set(),
    );
  }

  /**
   * Rehydrate from a persisted `profiles` row **without** re-validating
   * (the row was valid when written; revalidating would reject legacy data).
   * Friends are loaded lazily by the friend-graph read path, not here, so the
   * rehydrated friend set is empty — `editDetails` / `changeHandle` don't
   * touch friendships.
   */
  static fromPersistence(props: {
    id: UserId;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    homeCity: string | null;
    handle: string;
    positions: ProfilePositions;
    socialHandles: ProfileSocialHandles;
    autoAcceptTeamInvites: boolean;
    showProBadge: boolean;
    themePreference: string;
    heroImageUrl: string | null;
    businessInfo: ProfileBusinessInfo;
  }): UserProfile {
    return new UserProfile(
      props.id,
      props.displayName,
      props.firstName,
      props.lastName,
      props.homeCity,
      props.handle,
      { ...props.positions },
      { ...props.socialHandles },
      props.autoAcceptTeamInvites,
      props.showProBadge,
      props.themePreference,
      props.heroImageUrl,
      { ...props.businessInfo },
      new Set(),
    );
  }

  get displayName(): string {
    return this._displayName;
  }
  get firstName(): string | null {
    return this._firstName;
  }
  get lastName(): string | null {
    return this._lastName;
  }
  get homeCity(): string | null {
    return this._homeCity;
  }
  get handle(): string {
    return this._handle;
  }
  get positions(): Readonly<ProfilePositions> {
    return this._positions;
  }
  get socialHandles(): Readonly<ProfileSocialHandles> {
    return this._socialHandles;
  }
  get autoAcceptTeamInvites(): boolean {
    return this._autoAcceptTeamInvites;
  }
  get showProBadge(): boolean {
    return this._showProBadge;
  }
  get themePreference(): string {
    return this._themePreference;
  }
  get heroImageUrl(): string | null {
    return this._heroImageUrl;
  }
  get businessInfo(): Readonly<ProfileBusinessInfo> {
    return this._businessInfo;
  }
  get friends(): ReadonlySet<UserId> {
    return this._friends;
  }

  /** Apply an edit from the profile form. Display name is required. */
  editDetails(edit: ProfileDetailsEdit): void {
    const displayName = edit.displayName.trim();
    if (!displayName) {
      throw new ValidationError('Display name is required.');
    }
    this._displayName = displayName;
    this._firstName = edit.firstName;
    this._lastName = edit.lastName;
    this._homeCity = edit.homeCity;
    this._positions = { ...edit.positions };
    this._socialHandles = { ...edit.socialHandles };
    this._autoAcceptTeamInvites = edit.autoAcceptTeamInvites;
    this._showProBadge = edit.showProBadge;
  }

  /**
   * Change the public handle. Validates the format; uniqueness is enforced by
   * the DB and surfaced as a `ConflictError` at the repository boundary.
   * Expects an already-normalized (lower-cased, trimmed) value.
   */
  changeHandle(handle: string): void {
    if (!HANDLE_RE.test(handle)) {
      throw new ValidationError(HANDLE_ERROR);
    }
    this._handle = handle;
  }

  /** Persist a cross-device theme preference (`'system'` stays a device cookie
   * and never reaches here — the column is `light | dark`). */
  setTheme(theme: StoredThemePreference): void {
    this._themePreference = theme;
  }

  /** Set (or clear, with `null`) the profile hero/banner image URL. */
  setHeroImage(url: string | null): void {
    this._heroImageUrl = url;
  }

  /** Replace the buyer-side business/receipt fields. */
  setBusinessInfo(info: ProfileBusinessInfo): void {
    this._businessInfo = { ...info };
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
