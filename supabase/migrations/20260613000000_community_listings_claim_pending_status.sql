-- ============================================================================
-- Community listings: introduce `claim_pending` status for moderated claims.
--
-- Context: bundle 73 hardened the claim handler with a same-day + same-city
-- match check and a unique index on `claimed_event_id`, but claims still
-- auto-applied — a host who satisfied the match check could immediately
-- redirect a listing they didn't post to their own event. Stage A of the
-- moderation queue (this migration) introduces a `claim_pending` state so
-- the original submitter (or a platform admin) has to explicitly approve
-- before a claim takes effect.
--
-- Impact: existing rows are unaffected (no backfill needed — `claim_pending`
-- is purely additive). The `claim` server action now transitions
-- `active → claim_pending` and a new pair of `approve` / `reject` actions
-- drive `claim_pending → claimed` and `claim_pending → active`. The unique
-- index on `claimed_event_id` shipped in 20260612000000 still applies and
-- now covers both `claim_pending` and `claimed` rows, which is intended:
-- one event id can back at most one outstanding claim across both states.
-- Stage B (notification kinds + 7-day auto-approve cron) is deferred.
-- ============================================================================

alter table public.community_listings
    drop constraint community_listings_status_check;

alter table public.community_listings
    add constraint community_listings_status_check
    check (status in ('active', 'hidden', 'claim_pending', 'claimed', 'removed'));
