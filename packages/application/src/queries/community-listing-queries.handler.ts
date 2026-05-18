import {
  NotFoundError,
  type CommunityListingDetailReadModel,
  type CommunityListingRepository,
  type CommunityListingSummary,
} from '@pickupvb/domain';
import { GetCommunityListingDetailQuery, SearchCommunityListingsQuery } from '../messages';

export class SearchCommunityListingsHandler {
  constructor(private readonly repo: CommunityListingRepository) {}

  async execute({
    viewerId,
    filters,
  }: SearchCommunityListingsQuery): Promise<CommunityListingSummary[]> {
    return this.repo.search({
      ...(filters.near ? { near: filters.near } : {}),
      ...(filters.surface ? { surface: filters.surface } : {}),
      ...(filters.format ? { format: filters.format } : {}),
      ...(filters.skillLevel ? { skillLevel: filters.skillLevel } : {}),
      ...(filters.startsAfter ? { startsAfter: filters.startsAfter } : {}),
      ...(filters.startsBefore ? { startsBefore: filters.startsBefore } : {}),
      ...(viewerId ? { viewerId } : {}),
      ...(filters.limit ? { limit: filters.limit } : {}),
      ...(filters.cursor ? { cursor: filters.cursor } : {}),
    });
  }
}

export class GetCommunityListingDetailHandler {
  constructor(private readonly repo: CommunityListingRepository) {}

  async execute({
    idOrSlug,
    viewerId,
  }: GetCommunityListingDetailQuery): Promise<CommunityListingDetailReadModel> {
    const detail = await this.repo.getDetail(idOrSlug, viewerId);
    if (!detail) throw new NotFoundError('CommunityListing', idOrSlug);
    return detail;
  }
}
