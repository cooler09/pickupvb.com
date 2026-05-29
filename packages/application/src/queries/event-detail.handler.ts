import type {
  EventDetailReadModel,
  EventRepository,
  FollowingFeedItem,
  FriendProfile,
  SocialGraphQueries,
} from '@pickupvb/domain';
import { NotFoundError } from '@pickupvb/domain';
import { GetEventDetailQuery, GetFollowingFeedQuery, GetViewerFriendsQuery } from '../messages.js';

export class GetEventDetailHandler {
  constructor(private readonly repo: EventRepository) {}

  async execute({ id, viewerId }: GetEventDetailQuery): Promise<EventDetailReadModel> {
    const detail = await this.repo.getDetail(id, viewerId);
    if (!detail) throw new NotFoundError('event', id);
    return detail;
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
