import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  EventId,
  ExternalVideoUrl,
  MediaPost,
  MediaPostId,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  UserId,
  ValidationError,
  isAwardCategory,
  type MediaPostRepository,
} from '@pickupvb/domain';
import {
  CastVoteCommand,
  CreateMediaPostCommand,
  EndLiveStreamCommand,
  FeatureEventStreamCommand,
  HideMediaPostCommand,
  RemoveMediaPostCommand,
  ReportMediaPostCommand,
  RetractVoteCommand,
  UnfeatureMediaPostCommand,
  UnhideMediaPostCommand,
  UpdateMediaPostCommand,
} from '../messages/index';

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MAX = 20;

/** Predicate: is `userId` a platform admin? */
export type IsPlatformAdmin = (userId: string) => Promise<boolean>;
/** Predicate: is `userId` the host (or co-host) of `eventId`? */
export type IsEventHost = (eventId: string, userId: string) => Promise<boolean>;

/** Submitter, the event's host, or a platform admin may manage a post. */
async function assertCanManage(
  post: MediaPost,
  requesterId: string,
  isAdmin: IsPlatformAdmin,
  isHost: IsEventHost,
): Promise<void> {
  if (String(post.submitterUserId) === requesterId) return;
  if (post.eventId && (await isHost(String(post.eventId), requesterId))) return;
  if (await isAdmin(requesterId)) return;
  throw new UnauthorizedError(
    'Only the poster, the event host, or an admin can manage this video.',
  );
}

/** Moderation/curation (hide/feature) is host-or-admin only — not the submitter. */
async function assertHostOrAdmin(
  post: MediaPost,
  requesterId: string,
  isAdmin: IsPlatformAdmin,
  isHost: IsEventHost,
): Promise<void> {
  if (post.eventId && (await isHost(String(post.eventId), requesterId))) return;
  if (await isAdmin(requesterId)) return;
  throw new UnauthorizedError('Only the event host or an admin can do that.');
}

export class CreateMediaPostHandler {
  constructor(private readonly repo: MediaPostRepository) {}

  async execute({ submitterUserId, dto }: CreateMediaPostCommand): Promise<{ id: string }> {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recent = await this.repo.countByUserSince(submitterUserId, since);
    if (recent >= RATE_LIMIT_MAX) {
      throw new RateLimitError(`You can post at most ${RATE_LIMIT_MAX} videos per 24 hours.`, {
        limit: RATE_LIMIT_MAX,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });
    }

    const post = MediaPost.create({
      id: MediaPostId(randomUUID()),
      submitterUserId: UserId(submitterUserId),
      eventId: dto.eventId ? EventId(dto.eventId) : null,
      matchId: dto.matchId ?? null,
      kind: dto.kind,
      videoUrl: ExternalVideoUrl.create(dto.videoUrl),
      title: dto.title,
      description: dto.description ?? '',
      ...(dto.kind === 'live_stream' ? { liveStartedAt: new Date() } : {}),
    });

    await this.repo.save(post);
    return { id: String(post.id) };
  }
}

export class UpdateMediaPostHandler {
  constructor(
    private readonly repo: MediaPostRepository,
    private readonly isPlatformAdmin: IsPlatformAdmin,
    private readonly isEventHost: IsEventHost,
  ) {}

  async execute({ postId, requesterId, dto }: UpdateMediaPostCommand): Promise<void> {
    const post = await this.repo.findById(postId);
    if (!post) throw new NotFoundError('MediaPost', postId);
    await assertCanManage(post, requesterId, this.isPlatformAdmin, this.isEventHost);

    post.update({
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.videoUrl !== undefined ? { videoUrl: ExternalVideoUrl.create(dto.videoUrl) } : {}),
    });
    await this.repo.save(post);
  }
}

export class RemoveMediaPostHandler {
  constructor(
    private readonly repo: MediaPostRepository,
    private readonly isPlatformAdmin: IsPlatformAdmin,
    private readonly isEventHost: IsEventHost,
  ) {}

  async execute({ postId, requesterId }: RemoveMediaPostCommand): Promise<void> {
    const post = await this.repo.findById(postId);
    if (!post) throw new NotFoundError('MediaPost', postId);
    await assertCanManage(post, requesterId, this.isPlatformAdmin, this.isEventHost);
    post.remove();
    await this.repo.save(post);
  }
}

export class ReportMediaPostHandler {
  constructor(private readonly repo: MediaPostRepository) {}

  async execute({ postId, reporterUserId, reason }: ReportMediaPostCommand): Promise<void> {
    const post = await this.repo.findById(postId);
    if (!post) throw new NotFoundError('MediaPost', postId);
    await this.repo.recordReport(postId, reporterUserId, reason);
  }
}

export class HideMediaPostHandler {
  constructor(
    private readonly repo: MediaPostRepository,
    private readonly isPlatformAdmin: IsPlatformAdmin,
    private readonly isEventHost: IsEventHost,
  ) {}

  async execute({ postId, requesterId }: HideMediaPostCommand): Promise<void> {
    const post = await this.repo.findById(postId);
    if (!post) throw new NotFoundError('MediaPost', postId);
    await assertHostOrAdmin(post, requesterId, this.isPlatformAdmin, this.isEventHost);
    post.hide();
    await this.repo.save(post);
  }
}

export class UnhideMediaPostHandler {
  constructor(
    private readonly repo: MediaPostRepository,
    private readonly isPlatformAdmin: IsPlatformAdmin,
    private readonly isEventHost: IsEventHost,
  ) {}

  async execute({ postId, requesterId }: UnhideMediaPostCommand): Promise<void> {
    const post = await this.repo.findById(postId);
    if (!post) throw new NotFoundError('MediaPost', postId);
    await assertHostOrAdmin(post, requesterId, this.isPlatformAdmin, this.isEventHost);
    post.unhide();
    await this.repo.save(post);
  }
}

export class FeatureEventStreamHandler {
  constructor(
    private readonly repo: MediaPostRepository,
    private readonly isPlatformAdmin: IsPlatformAdmin,
    private readonly isEventHost: IsEventHost,
  ) {}

  async execute({ postId, requesterId }: FeatureEventStreamCommand): Promise<void> {
    const post = await this.repo.findById(postId);
    if (!post) throw new NotFoundError('MediaPost', postId);
    if (post.kind !== 'live_stream' || !post.eventId) {
      throw new ConflictError('Only a live stream attached to an event can be featured.');
    }
    await assertHostOrAdmin(post, requesterId, this.isPlatformAdmin, this.isEventHost);
    // Cross-row clear-others + set-this runs in the host-gated RPC; the SQL
    // gate (`is_event_host`) is the real authorization, the check above gives
    // a typed error before we round-trip. (AGENTS.md gotcha #8.)
    await this.repo.featureEventStream(String(post.eventId), postId);
  }
}

export class UnfeatureMediaPostHandler {
  constructor(
    private readonly repo: MediaPostRepository,
    private readonly isPlatformAdmin: IsPlatformAdmin,
    private readonly isEventHost: IsEventHost,
  ) {}

  async execute({ postId, requesterId }: UnfeatureMediaPostCommand): Promise<void> {
    const post = await this.repo.findById(postId);
    if (!post) throw new NotFoundError('MediaPost', postId);
    await assertHostOrAdmin(post, requesterId, this.isPlatformAdmin, this.isEventHost);
    post.unfeature();
    await this.repo.save(post);
  }
}

export class EndLiveStreamHandler {
  constructor(
    private readonly repo: MediaPostRepository,
    private readonly isPlatformAdmin: IsPlatformAdmin,
    private readonly isEventHost: IsEventHost,
  ) {}

  async execute({ postId, requesterId }: EndLiveStreamCommand): Promise<void> {
    const post = await this.repo.findById(postId);
    if (!post) throw new NotFoundError('MediaPost', postId);
    await assertCanManage(post, requesterId, this.isPlatformAdmin, this.isEventHost);
    post.endLiveStream(new Date());
    await this.repo.save(post);
  }
}

export class CastVoteHandler {
  constructor(private readonly repo: MediaPostRepository) {}

  async execute({ eventId, postId, category, voterUserId }: CastVoteCommand): Promise<void> {
    if (!isAwardCategory(category)) {
      throw new ValidationError(`Unknown award category: ${category}`);
    }
    const post = await this.repo.findById(postId);
    if (!post) throw new NotFoundError('MediaPost', postId);
    if (!post.eventId || String(post.eventId) !== eventId) {
      throw new ValidationError('That clip is not part of this event.');
    }
    // Only active clips are votable (live streams / match videos are out).
    post.assertVotable();
    await this.repo.castVote(eventId, postId, category, voterUserId);
  }
}

export class RetractVoteHandler {
  constructor(private readonly repo: MediaPostRepository) {}

  async execute({ eventId, category, voterUserId }: RetractVoteCommand): Promise<void> {
    if (!isAwardCategory(category)) {
      throw new ValidationError(`Unknown award category: ${category}`);
    }
    await this.repo.retractVote(eventId, category, voterUserId);
  }
}
