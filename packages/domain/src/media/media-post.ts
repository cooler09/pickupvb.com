import { AggregateRoot } from '../shared/aggregate-root.js';
import { idConstructor, type Brand } from '../shared/brand.js';
import { ConflictError, InvariantViolation } from '../shared/result.js';
import type { EventId, UserId } from '../events/volleyball-event.js';
import { maskPublicText } from '../moderation/content-moderation.js';
import { ExternalVideoUrl } from './external-video-url.js';

export type MediaPostId = Brand<string, 'MediaPostId'>;
export const MediaPostId = idConstructor<'MediaPostId'>();

/** What the media post is. Drives where it surfaces on the event sub-page. */
export type MediaKind = 'live_stream' | 'match_video' | 'clip';

export type MediaPostStatus = 'active' | 'hidden' | 'removed';

export interface CreateMediaPostProps {
  id: MediaPostId;
  submitterUserId: UserId;
  /** The event this attaches to, or null for a profile-only post. */
  eventId: EventId | null;
  /** Reserved for Phase 2 (attach a clip to a specific match). */
  matchId: string | null;
  kind: MediaKind;
  videoUrl: ExternalVideoUrl;
  title: string;
  description: string;
  /** For `live_stream`: when the stream went live. Caller supplies the clock. */
  liveStartedAt?: Date | null;
}

export interface UpdateMediaPostProps {
  title?: string;
  description?: string;
  videoUrl?: ExternalVideoUrl;
}

function normalizeTitle(raw: string): string {
  const t = (raw ?? '').trim();
  if (t.length < 3 || t.length > 200) {
    throw new InvariantViolation('Title must be 3–200 characters.');
  }
  // Public surface — mask Tier-A profanity, block Tier-B (ADR 0030).
  return maskPublicText(t);
}

/**
 * Aggregate root for a user-submitted video / livestream / clip.
 *
 * Media posts point at an **external** source (YouTube, Twitch, …) — the
 * platform hosts nothing. The aggregate owns the moderation lifecycle
 * (`active → hidden → removed`) and the `featured` flag (host-promoted live
 * stream). The "only one featured live stream per event" rule is a *cross-row*
 * constraint enforced at the DB (partial unique index) + the host-gated
 * `feature_event_stream` RPC — not an aggregate invariant.
 */
export class MediaPost extends AggregateRoot<MediaPostId> {
  private constructor(
    id: MediaPostId,
    public readonly submitterUserId: UserId,
    public readonly eventId: EventId | null,
    public readonly matchId: string | null,
    public readonly kind: MediaKind,
    private _videoUrl: ExternalVideoUrl,
    private _title: string,
    private _description: string,
    private _status: MediaPostStatus,
    private _reportCount: number,
    private _featured: boolean,
    private _liveStartedAt: Date | null,
    private _liveEndedAt: Date | null,
  ) {
    super(id);
  }

  // ---- Factories ----------------------------------------------------------
  static create(props: CreateMediaPostProps): MediaPost {
    const title = normalizeTitle(props.title);
    return new MediaPost(
      props.id,
      props.submitterUserId,
      props.eventId,
      props.matchId,
      props.kind,
      props.videoUrl,
      title,
      maskPublicText((props.description ?? '').trim()),
      'active',
      0,
      false,
      props.kind === 'live_stream' ? (props.liveStartedAt ?? null) : null,
      null,
    );
  }

  static fromPersistence(props: {
    id: MediaPostId;
    submitterUserId: UserId;
    eventId: EventId | null;
    matchId: string | null;
    kind: MediaKind;
    videoUrl: ExternalVideoUrl;
    title: string;
    description: string;
    status: MediaPostStatus;
    reportCount: number;
    featured: boolean;
    liveStartedAt: Date | null;
    liveEndedAt: Date | null;
  }): MediaPost {
    return new MediaPost(
      props.id,
      props.submitterUserId,
      props.eventId,
      props.matchId,
      props.kind,
      props.videoUrl,
      props.title,
      props.description,
      props.status,
      props.reportCount,
      props.featured,
      props.liveStartedAt,
      props.liveEndedAt,
    );
  }

  // ---- Accessors ----------------------------------------------------------
  get videoUrl(): ExternalVideoUrl {
    return this._videoUrl;
  }
  get title(): string {
    return this._title;
  }
  get description(): string {
    return this._description;
  }
  get status(): MediaPostStatus {
    return this._status;
  }
  get reportCount(): number {
    return this._reportCount;
  }
  get featured(): boolean {
    return this._featured;
  }
  get liveStartedAt(): Date | null {
    return this._liveStartedAt;
  }
  get liveEndedAt(): Date | null {
    return this._liveEndedAt;
  }

  // ---- Mutations ----------------------------------------------------------
  update(props: UpdateMediaPostProps): void {
    if (this._status === 'removed') {
      throw new ConflictError('Cannot update a removed media post.');
    }
    if (props.title !== undefined) this._title = normalizeTitle(props.title);
    if (props.description !== undefined)
      this._description = maskPublicText(props.description.trim());
    if (props.videoUrl !== undefined) this._videoUrl = props.videoUrl;
  }

  hide(): void {
    if (this._status === 'removed') {
      throw new ConflictError('Cannot hide a removed media post.');
    }
    this._status = 'hidden';
    this._featured = false;
  }

  unhide(): void {
    if (this._status !== 'hidden') {
      throw new ConflictError('Only hidden media posts can be re-activated.');
    }
    this._status = 'active';
  }

  remove(): void {
    this._status = 'removed';
    this._featured = false;
  }

  /**
   * Promote this post as the event's featured live stream. Guards: must be an
   * active live stream. The host action clears any other featured stream first
   * (DB partial unique index + RPC enforce one-per-event).
   */
  feature(): void {
    if (this.kind !== 'live_stream') {
      throw new ConflictError('Only live streams can be featured.');
    }
    if (this._status !== 'active') {
      throw new ConflictError('Only active live streams can be featured.');
    }
    this._featured = true;
  }

  unfeature(): void {
    this._featured = false;
  }

  /**
   * Guard for community award voting: only an **active clip** can receive a
   * vote. Live streams and match videos are out (you can't award an in-progress
   * broadcast, and the awards are "best clip of the tournament"). Hidden /
   * removed posts can't be voted on.
   */
  assertVotable(): void {
    if (this.kind !== 'clip') {
      throw new ConflictError('Only clips can be voted for an award.');
    }
    if (this._status !== 'active') {
      throw new ConflictError('Only active clips can be voted on.');
    }
  }

  /** Mark a live stream as ended. No longer "live", so it stops being featured. */
  endLiveStream(at: Date): void {
    if (this.kind !== 'live_stream') {
      throw new ConflictError('Only live streams can be ended.');
    }
    this._liveEndedAt = at;
    this._featured = false;
  }
}
