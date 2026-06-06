import { describe, it, expect } from 'vitest';
import {
  CommunityListing,
  CommunityListingId,
  EventId,
  ExternalUrl,
  RateLimitError,
  UserId,
  type CommunityListingRepository,
} from '@pickupvb/domain';
import type { CreateCommunityListingDto } from '@pickupvb/types';
import {
  AutoApproveExpiredCommunityClaimsHandler,
  CreateCommunityListingHandler,
} from './community-listing.handler.js';
import { CreateCommunityListingCommand } from '../messages/index.js';

const DTO: CreateCommunityListingDto = {
  title: 'Saturday morning beach league',
  description: '',
  externalUrl: 'https://www.facebook.com/events/123',
  startsAt: new Date('2026-07-01T17:00:00.000Z'),
} as CreateCommunityListingDto;

/**
 * In-memory repo for the create path. `countByUserSince` always reports the
 * user is already at the cap so the rate-limit branch fires for non-admins;
 * `getDetail` returns the canonical slug the handler reads back after save.
 * Only the three methods the create handler calls are implemented; the object
 * is cast to the full port at the construction site.
 */
class FakeRepo {
  saved = 0;
  async countByUserSince(): Promise<number> {
    return 5; // already at RATE_LIMIT_MAX
  }
  async save(): Promise<void> {
    this.saved += 1;
  }
  async getDetail(): Promise<{ slug: string }> {
    return { slug: 'saturday-morning-beach-league-abc123' };
  }
}

function handlerFor(isAdmin: boolean) {
  const repo = new FakeRepo();
  const handler = new CreateCommunityListingHandler(
    repo as unknown as CommunityListingRepository,
    async () => isAdmin,
  );
  return { repo, handler };
}

describe('CreateCommunityListingHandler rate limit', () => {
  it('throws RateLimitError when a non-admin is over the daily cap', async () => {
    const { handler } = handlerFor(false);
    await expect(
      handler.execute(new CreateCommunityListingCommand('regular-user', DTO)),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('lets a platform admin bypass the cap and create the listing', async () => {
    const { repo, handler } = handlerFor(true);
    const result = await handler.execute(new CreateCommunityListingCommand('admin-user', DTO));
    expect(repo.saved).toBe(1);
    expect(result.slug).toBe('saturday-morning-beach-league-abc123');
  });
});

function pendingClaim(id: string): CommunityListing {
  return CommunityListing.fromPersistence({
    id: CommunityListingId(id),
    submitterUserId: UserId('submitter'),
    title: 'Beach night',
    description: '',
    externalUrl: ExternalUrl.fromPersistence('https://example.com/e/1'),
    externalHostName: null,
    startsAt: new Date('2026-07-01T17:00:00.000Z'),
    endsAt: null,
    location: null,
    timeZone: null,
    surface: null,
    format: null,
    skillLevel: null,
    status: 'claim_pending',
    reportCount: 0,
    claimedEventId: EventId('event-1'),
    claimedByUserId: UserId('claimant'),
    claimedAt: new Date('2026-06-20T00:00:00.000Z'),
  });
}

class FakeAutoApproveRepo {
  saved: CommunityListing[] = [];
  constructor(private readonly pending: CommunityListing[]) {}
  async findClaimPendingOlderThan(): Promise<CommunityListing[]> {
    return this.pending;
  }
  async save(listing: CommunityListing): Promise<void> {
    this.saved.push(listing);
  }
}

describe('AutoApproveExpiredCommunityClaimsHandler', () => {
  it('approves each expired pending claim and reports its claimant', async () => {
    const listing = pendingClaim('listing-1');
    const repo = new FakeAutoApproveRepo([listing]);
    const handler = new AutoApproveExpiredCommunityClaimsHandler(
      repo as unknown as CommunityListingRepository,
    );
    const now = new Date('2026-06-28T00:00:00.000Z');

    const result = await handler.execute(new Date('2026-06-21T00:00:00.000Z'), now);

    expect(listing.status).toBe('claimed');
    expect(listing.claimedAt).toEqual(now);
    expect(repo.saved).toHaveLength(1);
    expect(result).toEqual([{ listingId: 'listing-1', claimantId: 'claimant' }]);
  });

  it('is a no-op when no pending claims are past the cutoff', async () => {
    const repo = new FakeAutoApproveRepo([]);
    const handler = new AutoApproveExpiredCommunityClaimsHandler(
      repo as unknown as CommunityListingRepository,
    );

    const result = await handler.execute(new Date());

    expect(result).toEqual([]);
    expect(repo.saved).toHaveLength(0);
  });
});
