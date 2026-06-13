import type { Format, SkillLevel, Surface } from '../events/enums.js';
import type { CommunityListing, CommunityListingStatus } from './community-listing.js';

/**
 * Repository contract (DDD port).
 * Adapter lives in @pickupvb/infrastructure.
 *
 * Write side returns/accepts the `CommunityListing` aggregate.
 * Read side returns denormalized read models shaped for the UI.
 */
/**
 * Lightweight identity lookup for the bulk importer's upsert: enough to decide
 * whether a re-imported draft creates a new listing or updates an existing one,
 * and to link to it — without rebuilding the full aggregate.
 */
export interface CommunityListingIdentity {
  id: string;
  slug: string;
  status: CommunityListingStatus;
}

export interface CommunityListingRepository {
  // ---- Write side ------------------------------------------------------
  findById(id: string): Promise<CommunityListing | null>;
  findBySlug(slug: string): Promise<CommunityListing | null>;
  /**
   * Identity of the earliest listing with this external URL, or null. The
   * external URL is the stable cross-import key the admin importer upserts on.
   */
  findByExternalUrl(externalUrl: string): Promise<CommunityListingIdentity | null>;
  save(listing: CommunityListing): Promise<void>;
  delete(id: string): Promise<void>;

  /**
   * Listings stuck in `claim_pending` whose claim was filed (`claimedAt`)
   * before `cutoff`. Drives the 7-day auto-approve cron (community-listings
   * audit CL-4).
   */
  findClaimPendingOlderThan(cutoff: Date): Promise<CommunityListing[]>;

  /** Used for rate limiting: how many non-removed submissions by this user since `since`. */
  countByUserSince(userId: string, since: Date): Promise<number>;

  /** Records a single report. Throws ConflictError on duplicate (same user, same listing). */
  recordReport(listingId: string, reporterUserId: string, reason: string | null): Promise<void>;

  // ---- Read side -------------------------------------------------------
  search(query: CommunityListingSearchQuery): Promise<CommunityListingSummary[]>;
  /**
   * The viewer's own `hidden` listings. Surfaced on the `/community` listing as
   * the in-app recovery path for a listing auto-hidden by reports — auto-hide is
   * a DB trigger with no notification, so without this the submitter has no way
   * back to it once it drops off the public feed. Soonest start first.
   */
  listHiddenBySubmitter(userId: string): Promise<CommunityListingSummary[]>;
  getDetail(
    idOrSlug: string,
    viewerId: string | null,
  ): Promise<CommunityListingDetailReadModel | null>;
}

export interface CommunityListingSearchQuery {
  near?: { latitude: number; longitude: number; radiusKm: number };
  surface?: Surface;
  format?: Format;
  skillLevel?: SkillLevel;
  startsAfter?: Date;
  startsBefore?: Date;
  /**
   * Sort direction by start time. Defaults to `'asc'` (soonest first) for the
   * upcoming view; pass `'desc'` for a "past events" view so the most recent
   * past event leads. Ignored when `near` is set (geo results sort by distance).
   */
  order?: 'asc' | 'desc';
  /** Pass viewer id so submitters can see their own hidden listings. Admins see all via RLS. */
  viewerId?: string;
  /** Defaults to ['active']. Pass ['active', 'hidden'] for admin views, etc. */
  statuses?: ReadonlyArray<CommunityListingStatus>;
  limit?: number;
  cursor?: string;
}

export interface CommunityListingSummary {
  id: string;
  slug: string;
  shortCode: string;
  title: string;
  externalUrl: string;
  externalHostName: string | null;
  startsAt: Date;
  endsAt: Date | null;
  /** True when only the date is known — render the date without a time. */
  allDay: boolean;
  /** IANA timezone for the venue. Null when location is unknown. */
  timeZone: string | null;
  city: string | null;
  region: string | null;
  surface: Surface | null;
  format: Format | null;
  skillLevel: SkillLevel | null;
  status: CommunityListingStatus;
  distanceKm: number | null;
}

export interface CommunityListingDetailReadModel {
  id: string;
  slug: string;
  shortCode: string;
  title: string;
  description: string;
  externalUrl: string;
  externalHostName: string | null;
  startsAt: Date;
  endsAt: Date | null;
  /** True when only the date is known — render the date without a time. */
  allDay: boolean;
  /** IANA timezone for the venue. Null when location is unknown. */
  timeZone: string | null;
  location: {
    addressLine: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    country: string;
    /** Null when the address couldn't be geocoded (no map / distance search). */
    latitude: number | null;
    longitude: number | null;
  } | null;
  surface: Surface | null;
  format: Format | null;
  skillLevel: SkillLevel | null;
  status: CommunityListingStatus;
  reportCount: number;
  submitter: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  claimedEventId: string | null;
  claimedByUserId: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  // Viewer-specific
  canManage: boolean;
  isPlatformAdmin: boolean;
  /** True if the viewer has already filed a report. */
  hasReported: boolean;
}
