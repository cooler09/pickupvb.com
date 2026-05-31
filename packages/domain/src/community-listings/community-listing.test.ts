import { describe, expect, it } from 'vitest';
import { ConflictError, InvariantViolation } from '../shared/result.js';
import { EventId, UserId } from '../events/volleyball-event.js';
import {
  CommunityListing,
  CommunityListingId,
  type CreateCommunityListingProps,
  type ListingLocation,
} from './community-listing.js';
import { ExternalUrl } from './external-url.js';

// The community-listing claim/approve state machine + create invariants were
// untested (architecture audit P3-4, "prioritize community-listing"). These
// pin the legal transitions and the guards that block illegal ones.

const URL = ExternalUrl.create('https://example.com/event');

function createProps(over: Partial<CreateCommunityListingProps> = {}): CreateCommunityListingProps {
  return {
    id: CommunityListingId('listing-1'),
    submitterUserId: UserId('submitter-1'),
    title: 'Saturday Open Gym',
    description: 'Drop-in doubles',
    externalUrl: URL,
    externalHostName: 'The Org',
    startsAt: new Date('2026-07-01T17:00:00Z'),
    endsAt: new Date('2026-07-01T20:00:00Z'),
    location: null,
    surface: null,
    format: null,
    skillLevel: null,
    ...over,
  };
}

function active(): CommunityListing {
  return CommunityListing.create(createProps());
}

const LOCATION: ListingLocation = {
  addressLine: '1 Main St',
  city: 'Long Beach',
  region: 'CA',
  postalCode: '90802',
  country: 'US',
  latitude: 33.77,
  longitude: -118.19,
};

describe('CommunityListing.create', () => {
  it('produces an active listing with zeroed claim/report state', () => {
    const listing = active();
    expect(listing.status).toBe('active');
    expect(listing.reportCount).toBe(0);
    expect(listing.claimedEventId).toBeNull();
    expect(listing.claimedByUserId).toBeNull();
    expect(listing.claimedAt).toBeNull();
  });

  it('rejects a title shorter than 3 or longer than 200 chars', () => {
    expect(() => CommunityListing.create(createProps({ title: 'ab' }))).toThrow(InvariantViolation);
    expect(() => CommunityListing.create(createProps({ title: 'x'.repeat(201) }))).toThrow(
      InvariantViolation,
    );
  });

  it('rejects an end time at or before the start time', () => {
    const startsAt = new Date('2026-07-01T20:00:00Z');
    expect(() => CommunityListing.create(createProps({ startsAt, endsAt: startsAt }))).toThrow(
      InvariantViolation,
    );
  });

  it('allows a null end time (open-ended listing)', () => {
    expect(CommunityListing.create(createProps({ endsAt: null })).endsAt).toBeNull();
  });

  it('normalizes a provided location and validates lat/lng range', () => {
    expect(CommunityListing.create(createProps({ location: LOCATION })).location?.city).toBe(
      'Long Beach',
    );
    expect(() =>
      CommunityListing.create(createProps({ location: { ...LOCATION, latitude: 91 } })),
    ).toThrow(InvariantViolation);
    expect(() =>
      CommunityListing.create(createProps({ location: { ...LOCATION, city: '  ' } })),
    ).toThrow(InvariantViolation);
  });
});

describe('CommunityListing claim flow', () => {
  it('active -> claim_pending records the proposed event/claimant/timestamp', () => {
    const listing = active();
    const at = new Date('2026-06-01T00:00:00Z');
    listing.proposeClaim(EventId('event-9'), UserId('claimant-2'), at);

    expect(listing.status).toBe('claim_pending');
    expect(String(listing.claimedEventId)).toBe('event-9');
    expect(String(listing.claimedByUserId)).toBe('claimant-2');
    expect(listing.claimedAt).toBe(at);
  });

  it('claim_pending -> claimed on approve, updating claimedAt', () => {
    const listing = active();
    listing.proposeClaim(EventId('event-9'), UserId('claimant-2'), new Date('2026-06-01'));
    const approvedAt = new Date('2026-06-02T12:00:00Z');
    listing.approveClaim(approvedAt);

    expect(listing.status).toBe('claimed');
    expect(listing.claimedAt).toBe(approvedAt);
    expect(String(listing.claimedEventId)).toBe('event-9'); // preserved
  });

  it('claim_pending -> active on reject, clearing the proposed claim', () => {
    const listing = active();
    listing.proposeClaim(EventId('event-9'), UserId('claimant-2'), new Date('2026-06-01'));
    listing.rejectClaim();

    expect(listing.status).toBe('active');
    expect(listing.claimedEventId).toBeNull();
    expect(listing.claimedByUserId).toBeNull();
    expect(listing.claimedAt).toBeNull();
  });

  it('a fresh claim can be filed after a rejection', () => {
    const listing = active();
    listing.proposeClaim(EventId('event-9'), UserId('claimant-2'), new Date('2026-06-01'));
    listing.rejectClaim();
    expect(() =>
      listing.proposeClaim(EventId('event-10'), UserId('claimant-3'), new Date('2026-06-03')),
    ).not.toThrow();
    expect(listing.status).toBe('claim_pending');
  });

  it('blocks a second claim while one is pending, and re-claiming a claimed listing', () => {
    const listing = active();
    listing.proposeClaim(EventId('event-9'), UserId('claimant-2'), new Date('2026-06-01'));
    expect(() =>
      listing.proposeClaim(EventId('event-10'), UserId('claimant-3'), new Date('2026-06-02')),
    ).toThrow(ConflictError);
    listing.approveClaim(new Date('2026-06-02'));
    expect(() =>
      listing.proposeClaim(EventId('event-10'), UserId('claimant-3'), new Date('2026-06-03')),
    ).toThrow(ConflictError);
  });

  it('approve/reject require a pending claim', () => {
    expect(() => active().approveClaim(new Date())).toThrow(ConflictError);
    expect(() => active().rejectClaim()).toThrow(ConflictError);
  });

  it('hidden and removed listings cannot be claimed', () => {
    const hidden = active();
    hidden.hide();
    expect(() => hidden.proposeClaim(EventId('e'), UserId('u'), new Date())).toThrow(ConflictError);

    const removed = active();
    removed.remove();
    expect(() => removed.proposeClaim(EventId('e'), UserId('u'), new Date())).toThrow(
      ConflictError,
    );
  });
});

describe('CommunityListing moderation', () => {
  it('hides an active listing and re-activates it', () => {
    const listing = active();
    listing.hide();
    expect(listing.status).toBe('hidden');
    listing.unhide();
    expect(listing.status).toBe('active');
  });

  it('only hidden listings can be unhidden', () => {
    expect(() => active().unhide()).toThrow(ConflictError);
  });

  it('cannot hide a claimed or removed listing', () => {
    const claimed = active();
    claimed.proposeClaim(EventId('e'), UserId('u'), new Date());
    claimed.approveClaim(new Date());
    expect(() => claimed.hide()).toThrow(ConflictError);

    const removed = active();
    removed.remove();
    expect(() => removed.hide()).toThrow(ConflictError);
  });

  it('removes an active listing but never a claimed one', () => {
    const listing = active();
    listing.remove();
    expect(listing.status).toBe('removed');

    const claimed = active();
    claimed.proposeClaim(EventId('e'), UserId('u'), new Date());
    claimed.approveClaim(new Date());
    expect(() => claimed.remove()).toThrow(ConflictError);
  });
});

describe('CommunityListing.update', () => {
  it('edits an active listing and re-validates title + time order', () => {
    const listing = active();
    listing.update({ title: 'Renamed Open Gym' });
    expect(listing.title).toBe('Renamed Open Gym');
    expect(() => listing.update({ title: 'no' })).toThrow(InvariantViolation);
    expect(() => listing.update({ endsAt: new Date('2000-01-01') })).toThrow(InvariantViolation);
  });

  it('is blocked while a claim is pending, claimed, or removed', () => {
    const pending = active();
    pending.proposeClaim(EventId('e'), UserId('u'), new Date());
    expect(() => pending.update({ title: 'Nope' })).toThrow(ConflictError);

    const claimed = active();
    claimed.proposeClaim(EventId('e'), UserId('u'), new Date());
    claimed.approveClaim(new Date());
    expect(() => claimed.update({ title: 'Nope' })).toThrow(ConflictError);

    const removed = active();
    removed.remove();
    expect(() => removed.update({ title: 'Nope' })).toThrow(ConflictError);
  });
});
