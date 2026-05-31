import type { MediaPost, MediaKind, MediaPostStatus } from './media-post.js';
import type { VideoProvider, VideoSubtype } from './external-video-url.js';
import type { AwardCategory } from './award.js';

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

  /**
   * Cast (or move) the voter's vote for `category` to `postId`. Upserts on the
   * `(event_id, category, voter_user_id)` unique key — one vote per category
   * per voter per event; voting a different clip moves the vote.
   */
  castVote(
    eventId: string,
    postId: string,
    category: AwardCategory,
    voterUserId: string,
  ): Promise<void>;

  /** Retract the voter's vote in `category` for this event (idempotent). */
  retractVote(eventId: string, category: AwardCategory, voterUserId: string): Promise<void>;

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

/**
 * Per-clip vote tallies + the viewer's current picks, for the live community
 * awards (ADR 0024). `counts` is keyed by post id; `viewerVotes` records which
 * clip the viewer has voted for in each category (or null).
 */
export interface EventAwards {
  counts: Record<string, { best_clip: number; biggest_fail: number }>;
  viewerVotes: { best_clip: string | null; biggest_fail: string | null };
}

/** Event media grouped by kind, streams featured-first. */
export interface EventMediaReadModel {
  liveStreams: MediaPostItem[];
  matchVideos: MediaPostItem[];
  clips: MediaPostItem[];
  /** True when the viewer may post (signed-in real user) — set at the boundary. */
  canManageEvent: boolean;
  /** Live community-award tallies for the event's clips. */
  awards: EventAwards;
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
