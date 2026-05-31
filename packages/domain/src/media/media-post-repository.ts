import type { MediaPost, MediaKind, MediaPostStatus } from './media-post.js';
import type { VideoProvider, VideoSubtype } from './external-video-url.js';

/**
 * Repository contract (DDD port).
 * Adapter lives in @pickupvb/infrastructure.
 *
 * Write side returns/accepts the `MediaPost` aggregate.
 * Read side returns denormalized read models shaped for the UI.
 */
export interface MediaPostRepository {
  // ---- Write side ------------------------------------------------------
  findById(id: string): Promise<MediaPost | null>;
  save(post: MediaPost): Promise<void>;
  delete(id: string): Promise<void>;

  /** Rate limiting: how many posts this user has created since `since`. */
  countByUserSince(userId: string, since: Date): Promise<number>;

  /** Records a single report. Throws ConflictError on duplicate (same user, same post). */
  recordReport(postId: string, reporterUserId: string, reason: string | null): Promise<void>;

  /**
   * Promote one live stream as the event's featured stream, clearing any
   * other featured stream on the same event. Implemented via a host-gated
   * `SECURITY DEFINER` RPC so the cross-row update is authorized server-side.
   */
  featureEventStream(eventId: string, postId: string): Promise<void>;

  // ---- Read side -------------------------------------------------------
  listForEvent(eventId: string, viewerId: string | null): Promise<EventMediaReadModel>;
  listForProfile(userId: string, viewerId: string | null): Promise<MediaPostItem[]>;
  /** Cheap summary for the event detail page footprint (pill + link). */
  getEventMediaSummary(eventId: string): Promise<EventMediaSummary>;
}

/** A single media post as rendered in a list. */
export interface MediaPostItem {
  id: string;
  shortCode: string | null;
  kind: MediaKind;
  provider: VideoProvider;
  externalId: string | null;
  subtype: VideoSubtype;
  videoUrl: string;
  title: string;
  description: string;
  status: MediaPostStatus;
  featured: boolean;
  isLive: boolean;
  liveStartedAt: Date | null;
  liveEndedAt: Date | null;
  reportCount: number;
  createdAt: Date;
  submitter: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  // Viewer-specific
  canManage: boolean;
  hasReported: boolean;
}

/** Event media grouped by kind, streams featured-first. */
export interface EventMediaReadModel {
  liveStreams: MediaPostItem[];
  matchVideos: MediaPostItem[];
  clips: MediaPostItem[];
  /** True when the viewer may post (signed-in real user) — set at the boundary. */
  canManageEvent: boolean;
}

export interface EventMediaSummary {
  totalCount: number;
  liveCount: number;
  featured: {
    id: string;
    provider: VideoProvider;
    externalId: string | null;
    subtype: VideoSubtype;
    videoUrl: string;
    title: string;
  } | null;
}
