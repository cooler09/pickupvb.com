import type { EventMediaReadModel, MediaPostItem, MediaPostRepository } from '@pickupvb/domain';
import { ListEventMediaQuery, ListProfileMediaQuery } from '../messages';

export class ListEventMediaHandler {
  constructor(private readonly repo: MediaPostRepository) {}

  async execute({ eventId, viewerId }: ListEventMediaQuery): Promise<EventMediaReadModel> {
    return this.repo.listForEvent(eventId, viewerId);
  }
}

export class ListProfileMediaHandler {
  constructor(private readonly repo: MediaPostRepository) {}

  async execute({ userId, viewerId }: ListProfileMediaQuery): Promise<MediaPostItem[]> {
    return this.repo.listForProfile(userId, viewerId);
  }
}
