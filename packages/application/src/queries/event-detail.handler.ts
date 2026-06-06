import type {
  EventBracketMetaReadModel,
  EventDetailReadModel,
  EventReadModels,
  FollowingFeedItem,
  FriendProfile,
  SocialGraphQueries,
} from '@pickupvb/domain';
import { NotFoundError } from '@pickupvb/domain';
import {
  GetEventBracketMetaQuery,
  GetEventDetailQuery,
  GetFollowingFeedQuery,
  GetViewerFriendsQuery,
} from '../messages/index.js';

export class GetEventDetailHandler {
  constructor(private readonly repo: EventReadModels) {}

  async execute({ id, viewerId }: GetEventDetailQuery): Promise<EventDetailReadModel> {
    const detail = await this.repo.getDetail(id, viewerId);
    if (!detail) throw new NotFoundError('event', id);
    return detail;
  }
}

/**
 * Lightweight, viewer-independent event metadata for the bracket / schedule /
 * watch spectator pages (performance audit P3 #15). Throws `NotFoundError` if
 * the event doesn't exist, matching {@link GetEventDetailHandler}.
 */
export class GetEventBracketMetaHandler {
  constructor(private readonly repo: EventReadModels) {}

  async execute({ id }: GetEventBracketMetaQuery): Promise<EventBracketMetaReadModel> {
    const meta = await this.repo.getBracketMeta(id);
    if (!meta) throw new NotFoundError('event', id);
    return meta;
  }
}

export class GetFollowingFeedHandler {
  constructor(private readonly social: SocialGraphQueries) {}

  execute({ viewerId, friendIds, filters }: GetFollowingFeedQuery): Promise<FollowingFeedItem[]> {
    return this.social.searchFollowingFeed(viewerId, friendIds, filters);
  }
}

export class GetViewerFriendsHandler {
  constructor(private readonly social: SocialGraphQueries) {}

  execute({ viewerId }: GetViewerFriendsQuery): Promise<FriendProfile[]> {
    return this.social.getViewerFriends(viewerId);
  }
}
