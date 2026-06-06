import type {
  CreateCommunityListingDto,
  SearchCommunityListingsDto,
  UpdateCommunityListingDto,
} from '@pickupvb/types';

// ---- Community listings commands ----------------------------------------
export class CreateCommunityListingCommand {
  constructor(
    public readonly submitterUserId: string,
    public readonly dto: CreateCommunityListingDto,
  ) {}
}

export class UpdateCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly requesterId: string,
    public readonly dto: UpdateCommunityListingDto,
  ) {}
}

export class DeleteCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly requesterId: string,
  ) {}
}

export class ReportCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly reporterUserId: string,
    public readonly reason: string | null,
  ) {}
}

export class HideCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly requesterId: string,
  ) {}
}

export class UnhideCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly requesterId: string,
  ) {}
}

export class ClaimCommunityListingCommand {
  constructor(
    public readonly listingId: string,
    public readonly requesterId: string,
    public readonly eventId: string,
  ) {}
}

export class ApproveCommunityListingClaimCommand {
  constructor(
    public readonly listingId: string,
    public readonly approverId: string,
  ) {}
}

export class RejectCommunityListingClaimCommand {
  constructor(
    public readonly listingId: string,
    public readonly rejecterId: string,
  ) {}
}

// ---- Community listings queries -----------------------------------------
export class SearchCommunityListingsQuery {
  constructor(
    public readonly viewerId: string | null,
    public readonly filters: SearchCommunityListingsDto,
  ) {}
}

export class GetCommunityListingDetailQuery {
  constructor(
    public readonly idOrSlug: string,
    public readonly viewerId: string | null,
  ) {}
}
