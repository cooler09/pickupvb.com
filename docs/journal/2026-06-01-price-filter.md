# Price filter (F-6) (2026-06-01)

## Context

Closes finding **F-6** in [find-events-ux.md](../audits/find-events-ux.md):
the `/events` filter row covered surface/type/skill/age/team/series/radius but
not **price** — and "free pickup tonight" is one of the most common
visitor/player intents. The first discovery bundle had already put a price chip
on the card (F-2), so the data was on screen but not filterable.

## Decisions

- **Filter in-memory, not in the search RPC — no migration.** Price lives on
  `event_divisions`, and the search already projects it onto each result's
  `divisions[]`. Adding a `p_free_only`/`p_max_price` arg to `search_events`
  would mean editing + redeploying the RPC for what a one-line array filter does
  over the already-fetched set. Applied before the pagination slice so the
  result count and page count reflect the filtered set.
- **Reuse one "free" definition.** Exported `isEventFree(divisions)` from
  `event-card.tsx` and had both the price chip (`priceLabel`) and the page
  filter call it, so **"Free" filter ≡ green "Free" chip** — no chance of the
  filter and the visible badge disagreeing. "paid" is the complement
  (`!isEventFree`), which correctly includes mixed free+paid events (you pay for
  _something_).
- **`Any / Free / Paid` select, not a checkbox.** Matches the existing row of
  filter selects (consistent control vocabulary) and leaves room for price
  bands later without changing the control type.
- **Scoped to Upcoming/Past; dropped when switching to Following.** The Following
  feed projects no `divisions` (see F-4 journal), so `isEventFree` can't decide
  there. The select is only rendered off the Following tab, the in-memory filter
  is guarded `when !== 'following'`, and `buildHref` drops the `price` param when
  the target tab is Following (same treatment as the location params).

## Changes

- [event-filter-options.ts](../../apps/web/src/app/events/_components/event-filter-options.ts)
  — new shared `PRICES` / `PriceFilter` / `PRICE_FILTER_LABEL`.
- [event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx) —
  exported `isEventFree(divisions)`; `priceLabel` now delegates to it.
- [event-filter-form.tsx](../../apps/web/src/app/events/_components/event-filter-form.tsx)
  — `Price` select in the primary row (4-col grid now), rendered only when
  `when !== 'following'`; auto-apply picks it up via the existing FormData path.
- [active-filter-chips.tsx](../../apps/web/src/app/events/_components/active-filter-chips.tsx)
  — `price` chip + `'price'` `FilterKey` for one-click removal.
- [page.tsx](../../apps/web/src/app/events/page.tsx) — parse `price`; filter
  `events` in-memory (Upcoming/Past) before pagination; thread `price` into
  `hasAnyFilter`, `buildHref`, the form, and the chips.

## Follow-ups

- **Price on the Following card (F-2 for the feed)** would also unlock the price
  _filter_ on the Following tab — both blocked on projecting the primary
  division's price onto `FollowingFeedItem`. Tracked in
  [find-events-ux.md](../audits/find-events-ux.md).
- Remaining find-events backlog: **F-7** (manual city/ZIP location) at P2;
  **F-9–F-13** at P3.
