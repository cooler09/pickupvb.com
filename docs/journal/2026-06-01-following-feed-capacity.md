# Following-feed capacity (F-4 follow-up) (2026-06-01)

## Context

Follow-up to [2026-06-01-find-events-discovery-bundle.md](2026-06-01-find-events-discovery-bundle.md),
closing the deferred half of finding **F-4** in
[find-events-ux.md](../audits/find-events-ux.md). The first bundle added the
colored capacity badge to the event card, but it only lit up on Upcoming/Past
(where the `search_events` RPC projects `spots_remaining`); the **Following
feed** — the default tab for engaged users (≥3 follows) — hardcoded
`spotsRemaining: null`, so the players most likely to act never saw capacity.

## Decisions

- **Read `events_view`, not base `events`, and compute capacity in JS like the
  RPC does — no migration.** Investigated whether closing this needed a new
  view/RPC; it didn't. `events_view` already exposes the computed
  `attendee_count`, `event_divisions` already carries `capacity_kind`/`max_spots`,
  and `searchFollowingFeed` already runs a primary-division hydrate query for
  skill. So the change is: swap the events read to `events_view` (one extra
  selected column), pull two more columns in the hydrate query, and apply the
  same formula the RPC uses (`capacity_kind = 'fixed' ? max_spots − attendee_count
: null`). Chose this over adding the feed to `search_events` (would conflate
  the friend-graph OR-filter with the generic search RPC) or a new RPC (nothing
  to encapsulate).
- **Don't clamp negatives.** Matched the RPC, which returns `max_spots −
attendee_count` unclamped; the card already treats `<= 0` as "Full", so an
  over-capacity event reads identically on both paths.
- **Scoped to capacity, not price.** Price on the Following card (F-2 for the
  feed) needs the primary division's price projected onto `FollowingFeedItem`;
  left open to keep this change tight and single-purpose.

## Changes

- [social-graph-queries.ts](../../packages/domain/src/users/social-graph-queries.ts)
  — added `spotsRemaining: number | null` to `FollowingFeedItem`.
- [supabase-social-graph-repository.ts](../../packages/infrastructure/src/supabase-social-graph-repository.ts)
  — `searchFollowingFeed` now reads `events_view` (+ `attendee_count`); the
  skill-hydrate query also selects `capacity_kind`/`max_spots` and builds a
  `capacityByEvent` map off the primary (lowest `sort_order`) division;
  `spots_remaining` computed in the result mapping.
- [page.tsx](../../apps/web/src/app/events/page.tsx) — Following mapping now
  passes `spotsRemaining: it.spotsRemaining` (was `null`).
- [event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx) —
  updated the capacity-badge comment (no longer "null on the Following feed").

## Patterns observed

- **`events_view` is the read-model seam for capacity, reusable beyond the
  search RPC.** It exposes `attendee_count`/`team_count` (and `latitude`/
  `longitude`, `hero_image_url`) so any read path can compute `spots_remaining`
  with the primary division's `capacity_kind`/`max_spots` instead of base
  `events`. Worth remembering for F-13 (card thumbnails) — `hero_image_url` is
  already on the view.

## Follow-ups

- **Price on the Following card (F-2 for the feed)** — project the primary
  division's `price_cents`/`price_unit` onto `FollowingFeedItem` so `priceLabel`
  has data. Tracked in [find-events-ux.md](../audits/find-events-ux.md) F-4 note.
