import type { Format, SkillLevel, Surface } from '../events/enums.js';
import type { CommunityListing, CommunityListingStatus } from './community-listing.js';

/**
 * Repository contract (DDD port).
 * Adapter lives in @pickupvb/infrastructure.
 *
 * Write side returns/accepts the `CommunityListing` aggregate.
 * Read side returns denormalized read models shaped for the UI.
 */
export interface CommunityListingRepository {
  // ---- Write side ------------------------------------------------------
  findById(id: string): Promise<CommunityListing | null>;
  findBySlug(slug: string): Promise<CommunityListing | null>;
  save(listing: CommunityListing): Promise<void>;
  delete(id: string): Promise<void>;

  /** Used for rate limiting: how many active submissions by this user since `since`. */
  countByUserSince(userId: string, since: Date): Promise<number>;

  /** Records a single report. Throws ConflictError on duplicate (same user, same listing). */
  recordReport(listingId: string, reporterUserId: string, reason: string | null): Promise<void>;

  // ---- Read side -------------------------------------------------------
  search(query: CommunityListingSearchQuery): Promise<CommunityListingSummary[]>;
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
  location: {
    addressLine: string | null;
    city: string;
    region: string | null;
    postalCode: string | null;
    country: string;
    latitude: number;
    longitude: number;
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
  claimedAt: Date | null;
  createdAt: Date;
  // Viewer-specific
  canManage: boolean;
  isPlatformAdmin: boolean;
  /** True if the viewer has already filed a report. */
  hasReported: boolean;
}
