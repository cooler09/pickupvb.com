import { describe, it, expect } from 'vitest';
import {
  CommunityListing,
  CommunityListingId,
  ExternalUrl,
  UserId,
  type ListingLocation,
} from '@pickupvb/domain';
import type { CreateCommunityListingDto } from '@pickupvb/types';
import { dtoMatchesListing } from './listing-diff';

const LOC: ListingLocation = {
  addressLine: null,
  city: 'Tampa',
  region: 'FL',
  postalCode: null,
  country: 'United States',
  latitude: 27.95,
  longitude: -82.46,
};

function listing(over: Record<string, unknown> = {}): CommunityListing {
  return CommunityListing.fromPersistence({
    id: CommunityListingId('l1'),
    submitterUserId: UserId('u1'),
    title: 'Beach Doubles',
    description: 'Fun',
    externalUrl: ExternalUrl.fromPersistence('https://volleyballlife.com/event/1'),
    externalHostName: 'SSOVA',
    startsAt: new Date('2026-07-01T16:00:00.000Z'),
    endsAt: null,
    allDay: true,
    location: { ...LOC },
    timeZone: 'America/New_York',
    surface: 'sand',
    format: 'doubles',
    skillLevel: null,
    status: 'active',
    reportCount: 0,
    claimedEventId: null,
    claimedByUserId: null,
    claimedAt: null,
    ...over,
  });
}

const dto = (over: Partial<CreateCommunityListingDto> = {}): CreateCommunityListingDto =>
  ({
    title: 'Beach Doubles',
    description: 'Fun',
    externalUrl: 'https://volleyballlife.com/event/1',
    externalHostName: 'SSOVA',
    startsAt: new Date('2026-07-01T16:00:00.000Z'),
    endsAt: null,
    allDay: true,
    location: { ...LOC },
    timeZone: 'America/New_York',
    surface: 'sand',
    format: 'doubles',
    skillLevel: null,
    ...over,
  }) as CreateCommunityListingDto;

describe('dtoMatchesListing', () => {
  it('matches an identical re-import', () => {
    expect(dtoMatchesListing(listing(), dto())).toBe(true);
  });

  it('tolerates sub-meter coord float round-trip', () => {
    expect(dtoMatchesListing(listing(), dto({ location: { ...LOC, latitude: 27.950004 } }))).toBe(
      true,
    );
  });

  it('trims title/description before comparing', () => {
    expect(dtoMatchesListing(listing(), dto({ title: '  Beach Doubles  ' }))).toBe(true);
  });

  it.each([
    ['title', dto({ title: 'New Name' })],
    ['start instant', dto({ startsAt: new Date('2026-07-01T17:00:00.000Z') })],
    ['surface', dto({ surface: 'grass' as CreateCommunityListingDto['surface'] })],
    ['allDay', dto({ allDay: false })],
    ['host', dto({ externalHostName: 'Other' })],
    ['moved >1m', dto({ location: { ...LOC, latitude: 28.1 } })],
    ['location removed', dto({ location: null })],
  ])('detects a changed %s', (_label, changed) => {
    expect(dtoMatchesListing(listing(), changed)).toBe(false);
  });
});
