import { AggregateRoot } from '../shared/aggregate-root.js';
import type { Brand } from '../shared/brand.js';
import { ConflictError, InvariantViolation } from '../shared/result.js';
import type { EventId, UserId } from '../events/volleyball-event.js';
import type { Format, SkillLevel, Surface } from '../events/enums.js';
import { ExternalUrl } from './external-url.js';

export type CommunityListingId = Brand<string, 'CommunityListingId'>;

export type CommunityListingStatus = 'active' | 'hidden' | 'claimed' | 'removed';

/**
 * Optional location for a listing. All fields move together: either every
 * required field is present, or the whole location is null. Coordinates are
 * required when a location is present so geo search works.
 */
export interface ListingLocation {
  addressLine: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
  latitude: number;
  longitude: number;
}

export interface CreateCommunityListingProps {
  id: CommunityListingId;
  submitterUserId: UserId;
  title: string;
  description: string;
  externalUrl: ExternalUrl;
  externalHostName: string | null;
  startsAt: Date;
  endsAt: Date | null;
  location: ListingLocation | null;
  /** IANA timezone name for the venue (e.g. `America/Los_Angeles`). */
  timeZone?: string | null;
  surface: Surface | null;
  format: Format | null;
  skillLevel: SkillLevel | null;
}

export interface UpdateCommunityListingProps {
  title?: string;
  description?: string;
  externalUrl?: ExternalUrl;
  externalHostName?: string | null;
  startsAt?: Date;
  endsAt?: Date | null;
  location?: ListingLocation | null;
  timeZone?: string | null;
  surface?: Surface | null;
  format?: Format | null;
  skillLevel?: SkillLevel | null;
}

function normalizeLocation(loc: ListingLocation | null): ListingLocation | null {
  if (loc === null) return null;
  if (!loc.city.trim() || !loc.country.trim()) {
    throw new InvariantViolation('City and country are required when location is provided.');
  }
  if (loc.latitude < -90 || loc.latitude > 90) {
    throw new InvariantViolation('Latitude must be between -90 and 90.');
  }
  if (loc.longitude < -180 || loc.longitude > 180) {
    throw new InvariantViolation('Longitude must be between -180 and 180.');
  }
  return {
    addressLine: loc.addressLine?.trim() || null,
    city: loc.city.trim(),
    region: loc.region?.trim() || null,
    postalCode: loc.postalCode?.trim() || null,
    country: loc.country.trim(),
    latitude: loc.latitude,
    longitude: loc.longitude,
  };
}

function normalizeTitle(raw: string): string {
  const t = (raw ?? '').trim();
  if (t.length < 3 || t.length > 200) {
    throw new InvariantViolation('Title must be 3–200 characters.');
  }
  return t;
}

function assertTimeOrder(starts: Date, ends: Date | null): void {
  if (ends !== null && ends <= starts) {
    throw new InvariantViolation('Listing end time must be after start time.');
  }
}

/**
 * Aggregate root for a community-submitted event listing.
 *
 * Listings are *informational*: they point at an external source (Facebook
 * post, organizer site, etc.) and do not carry RSVPs or payments. The
 * platform's role is moderation (hide / remove) and discovery (search).
 */
export class CommunityListing extends AggregateRoot<CommunityListingId> {
  private constructor(
    id: CommunityListingId,
    public readonly submitterUserId: UserId,
    private _title: string,
    private _description: string,
    private _externalUrl: ExternalUrl,
    private _externalHostName: string | null,
    private _startsAt: Date,
    private _endsAt: Date | null,
    private _location: ListingLocation | null,
    private _timeZone: string | null,
    private _surface: Surface | null,
    private _format: Format | null,
    private _skillLevel: SkillLevel | null,
    private _status: CommunityListingStatus,
    private _reportCount: number,
    private _claimedEventId: EventId | null,
    private _claimedByUserId: UserId | null,
    private _claimedAt: Date | null,
  ) {
    super(id);
  }

  // ---- Factories -----------------------------------------------------------
  static create(props: CreateCommunityListingProps): CommunityListing {
    const title = normalizeTitle(props.title);
    assertTimeOrder(props.startsAt, props.endsAt);
    const location = normalizeLocation(props.location);
    return new CommunityListing(
      props.id,
      props.submitterUserId,
      title,
      (props.description ?? '').trim(),
      props.externalUrl,
      props.externalHostName?.trim() || null,
      props.startsAt,
      props.endsAt,
      location,
      props.timeZone ?? null,
      props.surface,
      props.format,
      props.skillLevel,
      'active',
      0,
      null,
      null,
      null,
    );
  }

  static fromPersistence(props: {
    id: CommunityListingId;
    submitterUserId: UserId;
    title: string;
    description: string;
    externalUrl: ExternalUrl;
    externalHostName: string | null;
    startsAt: Date;
    endsAt: Date | null;
    location: ListingLocation | null;
    timeZone?: string | null;
    surface: Surface | null;
    format: Format | null;
    skillLevel: SkillLevel | null;
    status: CommunityListingStatus;
    reportCount: number;
    claimedEventId: EventId | null;
    claimedByUserId: UserId | null;
    claimedAt: Date | null;
  }): CommunityListing {
    return new CommunityListing(
      props.id,
      props.submitterUserId,
      props.title,
      props.description,
      props.externalUrl,
      props.externalHostName,
      props.startsAt,
      props.endsAt,
      props.location,
      props.timeZone ?? null,
      props.surface,
      props.format,
      props.skillLevel,
      props.status,
      props.reportCount,
      props.claimedEventId,
      props.claimedByUserId,
      props.claimedAt,
    );
  }

  // ---- Accessors ----------------------------------------------------------
  get title(): string {
    return this._title;
  }
  get description(): string {
    return this._description;
  }
  get externalUrl(): ExternalUrl {
    return this._externalUrl;
  }
  get externalHostName(): string | null {
    return this._externalHostName;
  }
  get startsAt(): Date {
    return this._startsAt;
  }
  get endsAt(): Date | null {
    return this._endsAt;
  }
  get location(): ListingLocation | null {
    return this._location;
  }
  /** IANA timezone for the venue (e.g. `America/Los_Angeles`). May be null. */
  get timeZone(): string | null {
    return this._timeZone;
  }
  get surface(): Surface | null {
    return this._surface;
  }
  get format(): Format | null {
    return this._format;
  }
  get skillLevel(): SkillLevel | null {
    return this._skillLevel;
  }
  get status(): CommunityListingStatus {
    return this._status;
  }
  get reportCount(): number {
    return this._reportCount;
  }
  get claimedEventId(): EventId | null {
    return this._claimedEventId;
  }
  get claimedByUserId(): UserId | null {
    return this._claimedByUserId;
  }
  get claimedAt(): Date | null {
    return this._claimedAt;
  }

  // ---- Mutations ----------------------------------------------------------
  update(props: UpdateCommunityListingProps): void {
    if (this._status === 'claimed' || this._status === 'removed') {
      throw new ConflictError('Cannot update a claimed or removed listing.');
    }
    const nextStarts = props.startsAt ?? this._startsAt;
    const nextEnds = props.endsAt !== undefined ? props.endsAt : this._endsAt;
    assertTimeOrder(nextStarts, nextEnds);
    if (props.title !== undefined) this._title = normalizeTitle(props.title);
    if (props.description !== undefined) this._description = props.description.trim();
    if (props.externalUrl !== undefined) this._externalUrl = props.externalUrl;
    if (props.externalHostName !== undefined) {
      this._externalHostName = props.externalHostName?.trim() || null;
    }
    if (props.startsAt !== undefined) this._startsAt = props.startsAt;
    if (props.endsAt !== undefined) this._endsAt = props.endsAt;
    if (props.location !== undefined) this._location = normalizeLocation(props.location);
    if (props.timeZone !== undefined) this._timeZone = props.timeZone ?? null;
    if (props.surface !== undefined) this._surface = props.surface;
    if (props.format !== undefined) this._format = props.format;
    if (props.skillLevel !== undefined) this._skillLevel = props.skillLevel;
  }

  hide(): void {
    if (this._status === 'claimed' || this._status === 'removed') {
      throw new ConflictError('Cannot hide a claimed or removed listing.');
    }
    this._status = 'hidden';
  }

  unhide(): void {
    if (this._status !== 'hidden') {
      throw new ConflictError('Only hidden listings can be re-activated.');
    }
    this._status = 'active';
  }

  remove(): void {
    if (this._status === 'claimed') {
      throw new ConflictError('Claimed listings cannot be removed.');
    }
    this._status = 'removed';
  }

  markClaimed(eventId: EventId, byUserId: UserId, at: Date): void {
    if (this._status === 'claimed') {
      throw new ConflictError('Listing has already been claimed.');
    }
    if (this._status === 'removed') {
      throw new ConflictError('Removed listings cannot be claimed.');
    }
    this._status = 'claimed';
    this._claimedEventId = eventId;
    this._claimedByUserId = byUserId;
    this._claimedAt = at;
  }
}
