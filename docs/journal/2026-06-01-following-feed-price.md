# Following-card price chip + filter (F-2/F-6 carry-over) (2026-06-01)

## Context

The last carry-over from the find-events audit
([find-events-ux.md](../audits/find-events-ux.md)). The price chip (F-2) and the
Free/Paid filter (F-6) worked on the search tabs but not on **Following** — that
feed projected no per-division prices, so `priceLabel` returned null and the
filter was gated off. This projects price onto the feed and removes the gates.

## Decisions

- **Project all divisions' price, collected in the query the feed already runs.**
  `searchFollowingFeed` already hydrates `event_divisions` per result (for skill
  - capacity). Adding `price_cents` / `price_unit` to that same select and
    collecting every division's cents (plus the primary's unit) is a few lines —
    no extra round-trip, no migration. The chip needs _all_ prices (to decide
    Free / `$X` / `From $X`), not just the primary, so the cents list is per
    division; the unit comes from the primary like skill/capacity.
- **Unify the card's price source behind `eventPriceCents(event)`.** The chip
  used to read `event.divisions`; the Following feed has no `divisions` (that
  array also drives the division chip-list, which Following shouldn't show). So
  added a separate `priceCents` (+ `priceUnit`) to `EventCardData` and a single
  accessor `eventPriceCents` = explicit list ?? prices-from-divisions. Both
  `priceLabel` and `isEventFree` now take the cents list, so **the chip and the
  filter share one source of truth** — they can't disagree about "free".
- **Drop the filter's `when !== 'following'` gates.** With prices available on
  every tab, the Price select renders on Following and the in-memory filter
  applies there (the filter always ran in the page over the fetched set, so
  no server-query change was needed). `buildHref` now keeps `price` across the
  Following tab; `hasAnyFilter` / `activeFilterCount` count it on every tab.
- **Sort stays non-Following.** Its "Nearest" option needs distances the
  Following feed doesn't carry; price-sort there would be the only live option,
  not worth ungating. Left as F-9 shipped it.

## Changes

- [social-graph-queries.ts](../../packages/domain/src/users/social-graph-queries.ts)
  — `priceCents: ReadonlyArray<number | null>` + `priceUnit: string | null` on
  `FollowingFeedItem`.
- [supabase-social-graph-repository.ts](../../packages/infrastructure/src/supabase-social-graph-repository.ts)
  — hydrate query selects `price_cents` / `price_unit`; collects all prices per
  event + the primary unit; maps them onto each item.
- [event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx) —
  `priceCents` / `priceUnit` on `EventCardData`; new `eventPriceCents` accessor;
  `isEventFree` + `priceLabel` take a cents list; chip reads `eventPriceCents`.
- [event-filter-form.tsx](../../apps/web/src/app/events/_components/event-filter-form.tsx)
  — Price select no longer gated to non-Following.
- [page.tsx](../../apps/web/src/app/events/page.tsx) — price filter / `hasAnyFilter`
  / `activeFilterCount` / `buildHref` / chips ungated for Following; `minPriceCents`
  - the filter read through `eventPriceCents`; Following mapping passes the prices.

## Follow-ups

- None — this closes the find-events UX audit (F-1…F-13 + carry-over all
  resolved). Re-audit if the page changes materially.
