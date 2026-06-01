# Find-events P3 polish: sort + design-system (F-9, F-12) (2026-06-01)

## Context

First P3 bundle on the events listing page, after all P1/P2 findings in
[find-events-ux.md](../audits/find-events-ux.md) shipped. Two small,
migration-free items: **F-9** (no way to reorder results) and **F-12** (the
page's own controls bypassing the shared button/token vocabulary).

## Decisions

- **Sort runs in-memory, in the existing auto-apply form.** Like the price
  filter (F-6), the page already holds the full fetched set, so a sort runs over
  it before the pagination slice — no RPC arg, no migration. Put the `Sort`
  select in the filter-form **footer** (next to Apply), not the filter grid: it's
  an ordering control, not a filter, so it stays visually distinct yet rides the
  same auto-apply + `buildHref` plumbing.
- **"Date" is the absence of a sort param, not a value.** The default is the
  per-tab date order already built in the page (soonest-first upcoming,
  most-recent-first past). `SORTS = ['distance','price']` only lists the
  overrides; the select's default `<option value="">Date</option>` clears the
  param. Keeps URLs clean and avoids re-encoding the past-descending special case
  as a sort value.
- **"Nearest" only when a location is active.** Distance is null without coords,
  so the option is conditional on `location` — no dead choice that silently
  no-ops. Nulls sort last for both distance and price so events missing the key
  don't jump to the front.
- **Sort isn't a chip.** It's an ordering, not a filter, so it's not in
  `ActiveFilterChips` and not in `hasAnyFilter` (it never causes an empty result
  set). It's reset via the select itself or "Clear filters".
- **F-12: adopt the canonical vocabulary, set the example.** Near-me now uses
  `secondaryButtonClass('sm')` + an SVG map-pin (matching the `LocationSearch`
  Search button added in F-7, so the two location controls are visually
  identical); the timeframe tabs use the `text-primary-fg` / `bg-primary-fg/20`
  tokens instead of `text-white` / `bg-white/20`. Both files reformatted 4→2
  space. While there, Near-me also gained `page` reset on navigate (parity with
  `LocationSearch`).

## Changes

- [event-filter-options.ts](../../apps/web/src/app/events/_components/event-filter-options.ts)
  — `SORTS` / `SortOption` / `SORT_LABEL`.
- [event-filter-form.tsx](../../apps/web/src/app/events/_components/event-filter-form.tsx)
  — `Sort` select in a justify-between footer (non-Following; "Nearest" gated on
  `location`).
- [page.tsx](../../apps/web/src/app/events/page.tsx) — parse `sort`;
  `minPriceCents` helper; in-memory sort after the price filter, before
  pagination; `sort` threaded into `buildHref` (dropped for Following) and the form.
- [near-me-button.tsx](../../apps/web/src/app/events/near-me-button.tsx) —
  `secondaryButtonClass` + SVG pin + `page` reset + 2-space.
- [event-timeframe-tabs.tsx](../../apps/web/src/app/events/_components/event-timeframe-tabs.tsx)
  — `text-primary-fg` / `bg-primary-fg/20` tokens + 2-space.

## Follow-ups

- Find-events backlog now: **F-10** (relative date labels / day grouping),
  **F-11** (collapse the filter card behind a single trigger), **F-13** (card
  thumbnails — the one needing `hero_image_url` projected through the search RPC;
  `events_view` already exposes the column). All P3. Tracked in
  [find-events-ux.md](../audits/find-events-ux.md).
