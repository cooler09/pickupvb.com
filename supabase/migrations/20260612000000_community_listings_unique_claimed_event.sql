-- ============================================================================
-- Community listings: one PickupVB event can back at most one claim.
--
-- Context: `community_listings.claimed_event_id` was nullable and unconstrained,
-- which combined with a weak application check (just "are you the host of any
-- event?") let a single PickupVB event be used to claim every active community
-- listing on the platform. This index pairs with a new application-layer
-- "same-day + same-city" match check; the unique index is belt-and-suspenders
-- so the invariant survives even if the app check has a bug.
--
-- Impact: insert/update writes that point a new claim at an already-claimed
-- event will fail with a unique-violation. The existing
-- `ClaimCommunityListingHandler` is being updated in the same change-bundle to
-- run the match check and throw `ConflictError` before the DB sees the write,
-- so this index should only fire on race conditions.
-- ============================================================================

create unique index if not exists community_listings_claimed_event_id_unique
    on public.community_listings (claimed_event_id)
    where claimed_event_id is not null;
