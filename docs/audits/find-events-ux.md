# Find Events Page UX Audit

_Last updated: 2026-06-01_

UX/UI re-evaluation of the **find-events discovery / listing page**
([apps/web/src/app/events/page.tsx](../../apps/web/src/app/events/page.tsx)) and
its components ([event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx),
[event-filter-form.tsx](../../apps/web/src/app/events/_components/event-filter-form.tsx),
[event-timeframe-tabs.tsx](../../apps/web/src/app/events/_components/event-timeframe-tabs.tsx),
[active-filter-chips.tsx](../../apps/web/src/app/events/_components/active-filter-chips.tsx),
[near-me-button.tsx](../../apps/web/src/app/events/near-me-button.tsx)).

Goal: make the page that every visitor and player passes through faster to
scan and act on, weighted to the **player / attendee** persona's "where, when,
how much, how full, how far" decision.

This file is complementary to — not a duplicate of:

- [events-page-ux.md](events-page-ux.md) — scoped to the event **detail** page
  (`/events/[id]`). This file covers the **listing** page (`/events`).
- [persona-ux.md](persona-ux.md) — the site-wide persona model + CTA/field
  vocabulary drift. The persona table below links there rather than restating
  it; design-system findings here cross-reference its CC-1…CC-5 items.
- [m3-alignment.md](m3-alignment.md) — M3 token/primitive conformance (the
  `text-white`-vs-`text-primary-fg` token drift in F-12 is the same class).

> **Status update (2026-06-01):** File created from a full persona-lens
> re-evaluation. The **first bundle shipped the same day** — the highest-leverage
> card-quality items, auto-apply filters, and the one correctness gap:
> **F-1 ✅, F-2 ✅, F-3 ✅, F-4 (card half) ✅, F-5 ✅, F-8 ✅**. A **follow-up the
> same day closed the F-4 Following-feed half** (capacity badge now lights up on
> the Following tab too — migration-free). So **F-4 is now fully ✅**. See
> **Remediation log** + journals
> [2026-06-01-find-events-discovery-bundle.md](../journal/2026-06-01-find-events-discovery-bundle.md)
> and [2026-06-01-following-feed-capacity.md](../journal/2026-06-01-following-feed-capacity.md).
> A further follow-up closed **F-6** (Free/Paid filter, in-memory, migration-free).
> **F-7** (manual city/ZIP location + primary radius) also shipped 2026-06-01.
> All P2s are now resolved. P3 bundles on 2026-06-01 closed **F-9** (sort),
> **F-12** (design-system tidy), **F-10** (relative date labels), and **F-13**
> (card thumbnails). **Only standing item: F-11** (filter-chrome consolidation,
> P3) — held pending a layout/IA decision.
>
> Grounding fact that shaped grading: the `search_events` RPC **already projects
> `priceCents`/`priceUnit` per division, `spotsRemaining`, `distanceKm`, and
> `isFundraiser`** ([supabase-event-repository.ts#L700-L789](../../packages/infrastructure/src/supabase-event-repository.ts#L700-L789)),
> so most card improvements were render-only (zero new query).

---

## Persona model

See the table in [persona-ux.md](persona-ux.md#the-persona-model-as-the-nav-encodes-it).
What each persona needs from **this** page specifically:

| Persona               | What the listing page must make obvious                                             |
| --------------------- | ----------------------------------------------------------------------------------- |
| **Visitor** (no auth) | Cost + location + "is this for me" at a glance; one path to sign in / browse a city |
| **Player / attendee** | Price, capacity (can I even join?), distance, skill — scannable across a grid       |
| **Anonymous user**    | Same as player; host CTA is correctly withheld (see persona-ux V-4)                 |
| **Host / organizer**  | A clear "Host an event" entry (header CTA + FAB — already present)                  |

---

## Findings

### A. Discovery / information scent (player persona)

#### F-1 — List was hard-capped at 30 with no pagination · **P1** · ✅ resolved 2026-06-01

The search fetched `limit: 30` and rendered the whole array with no
`Pagination` / "load more". In an active metro, event 31+ was **silently
unreachable** — broken user-visible behavior, and a violation of the repo's own
pagination convention (AGENTS.md pattern #12).
**Fix (done):** raised the fetch ceiling to 120 and paginate the display
in-memory (`PAGE_SIZE = 12`) with the shared
[Pagination](../../apps/web/src/components/pagination.tsx). In-memory slice
(not SQL `range()`) because the RPC returns a flat list with no exact count and
the page already loads the full set.
[page.tsx](../../apps/web/src/app/events/page.tsx).

#### F-2 — Cards never showed price · **P2** · ✅ resolved 2026-06-01

The single biggest decision input for a player wasn't on the card, even though
`divisions[].priceCents`/`priceUnit` are already on `EventCardData`.
**Fix (done):** `priceLabel(divisions)` → `Free` (green) / `$10` / `$10/team` /
`From $X`, rendered as a chip.
[event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx).

#### F-3 — Only the title was tappable, but the whole tile looked clickable · **P2** · ✅ resolved 2026-06-01

The `<li>` had `hover:border-primary/40` (interactive affordance) but only the
title `<Link>` navigated — tapping the date/location/tags did nothing, a real
mobile papercut.
**Fix (done):** stretched-link (`relative` li + `after:absolute after:inset-0`
on the title), whole tile clickable, `focus-within` ring for keyboard.
[event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx).

#### F-4 — Capacity was buried, and absent on the Following feed · **P2** · ✅ resolved 2026-06-01

"spots open" was tiny gray text at the bottom with no urgency treatment, and
the Following feed hardcoded `spotsRemaining: null` so the feed players act on
most never showed capacity.
**Fix (card, done):** colored badge near the tags — `Full` / `N left` (amber,
≤4) / `N spots`.
[event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx).
**Fix (Following feed, done):** `searchFollowingFeed` now reads `events_view`
(for the computed `attendee_count`) and pulls the primary division's
`capacity_kind`/`max_spots` in the skill-hydrate query it already runs,
computing `spots_remaining` exactly like the `search_events` RPC — **no
migration**. `spotsRemaining` added to `FollowingFeedItem`.
[supabase-social-graph-repository.ts](../../packages/infrastructure/src/supabase-social-graph-repository.ts),
[social-graph-queries.ts](../../packages/domain/src/users/social-graph-queries.ts).
**Still pending (folds into F-2):** _price_ on the Following card — the feed
projects no `divisions` array, so `priceLabel` returns null there. Closing it
means projecting the primary division's price onto `FollowingFeedItem`.

#### F-9 — No sort control · **P3** · ✅ resolved 2026-06-01

Results were RPC date-ascending only (past re-sorted descending); with Near-me
active there was no "by distance" / "cheapest" option, though `distanceKm` and
per-division prices are already on each card.
**Fix (done):** a `Sort` select in the filter-form footer — `Date` (default,
per-tab order), `Nearest` (shown only when a location is active), and
`Price: low to high`. Applied in-memory before the pagination slice (nulls
last). Non-Following only; dropped from the URL when switching to Following.
[event-filter-form.tsx](../../apps/web/src/app/events/_components/event-filter-form.tsx),
[page.tsx](../../apps/web/src/app/events/page.tsx). New shared
`SORTS`/`SortOption`/`SORT_LABEL` in `event-filter-options.ts`.

#### F-10 — Absolute dates only, no relative grouping · **P3** · ✅ resolved 2026-06-01

Cards showed `Sat, Jun 14, 6:00 PM`; players think "tonight / this weekend".
**Fix (done):** cards now lead with a relative day label — **Today / Tomorrow**
(0–1 days out) or the short weekday **Sat** (2–6 days), then the time; beyond a
week (and for past events) they fall back to the absolute date. New pure
`relativeEventDay(startsAt, timeZone, now)` in
[date-formats.ts](../../apps/web/src/lib/date-formats.ts) (+ test) anchors "today"
to the **event's own timezone** and takes `now` from the server page boundary,
so the card stays a pure server component (no `Date.now()` in render).
[event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx),
[page.tsx](../../apps/web/src/app/events/page.tsx). Chose per-card labels over
day-group section headers (the latter fights the pagination slice).

#### F-13 — Cards are text-only, no visual anchor · **P3** · ✅ resolved 2026-06-01

A discovery grid scans far faster with a thumbnail; the detail page had hero
images but the cards rendered none.
**Fix (done):** cards now lead with a 16:9 (`aspect-video`) thumbnail — the
event's `hero_image_url` via `next/image`, or a surface-tinted placeholder
(sand/grass/indoor) with a faint volleyball glyph when unset.
[event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx). The
thumbnail sits under the title's stretched link, so the whole card stays one
click target. **Migration-free:** rather than alter the big `search_events` RPC,
the repo fetches `hero_image_url` from `events_view` (which already exposes it)
by result id and merges in JS — cosmetic, so it degrades to the placeholder on a
lookup error
([supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts) `loadHeroImageUrls`).
The Following feed gets it for free off its existing `events_view` read
([supabase-social-graph-repository.ts](../../packages/infrastructure/src/supabase-social-graph-repository.ts)).
`heroImageUrl` added to `VolleyballEventSummary` + `FollowingFeedItem`.

### B. Filtering UX (all personas)

#### F-5 — Filters required an explicit "Apply", but Near-me applied instantly · **P2** · ✅ resolved 2026-06-01

The filter form was a GET form with a submit button (open select → choose →
scroll → click Apply), while `NearMeButton` did an instant `router.push` —
inconsistent and slow.
**Fix (done):** auto-apply on `change` via `router.push` + `useTransition`
(form dims while pending), `method="get"` + Apply button kept as the no-JS
fallback. [event-filter-form.tsx](../../apps/web/src/app/events/_components/event-filter-form.tsx).

#### F-6 — No way to filter by price (esp. "Free") · **P2** · ✅ resolved 2026-06-01

Filters cover surface/type/skill/age/team/series/radius but not price — "free
pickup tonight" is a top visitor intent and per-division prices are already in
the search projection.
**Fix (done):** added a `Price: Any / Free / Paid` select to the primary filter
row and filter the already-fetched set **in-memory** (migration-free) — "free"
reuses the exported `isEventFree(divisions)` so it matches the green "Free"
chip exactly; "paid" is the complement. Only offered on Upcoming/Past (the
Following feed projects no divisions); dropped from the URL when switching to
Following.
[event-filter-form.tsx](../../apps/web/src/app/events/_components/event-filter-form.tsx),
[page.tsx](../../apps/web/src/app/events/page.tsx),
[event-card.tsx](../../apps/web/src/app/events/_components/event-card.tsx) (`isEventFree`).

#### F-8 — No result count · **P3** · ✅ resolved 2026-06-01

The subheader described the timeframe but never said how many matched.
**Fix (done):** subheader now leads with `"14 events · …"`.
[page.tsx](../../apps/web/src/app/events/page.tsx).

#### F-11 — Filter chrome stacks four strips before the first result · **P3** · open

Header → tabs+Near-me row → filter card → active-chips row all render before any
event ([page.tsx#L290-L318](../../apps/web/src/app/events/page.tsx#L290-L318));
on mobile that's a lot of scroll-to-content.
**Fix:** collapse the filter card behind a single "Filters (2)" trigger
(disclosure or modal), keeping the active chips as the always-visible summary.

### C. Location (visitor / player)

#### F-7 — Location is GPS-or-nothing; radius is buried · **P2** · ✅ resolved 2026-06-01

"Near me" was a one-shot geolocation grab with no manual fallback — deny the
prompt or want another city and there was no ZIP/city input. Radius only
appeared **after** a location was set and was hidden inside "More filters".
For a discovery page this was the weakest axis.
**Fix (done):** added a **City/ZIP search** beside Near-me
([location-search.tsx](../../apps/web/src/app/events/location-search.tsx) +
[location-actions.ts](../../apps/web/src/app/events/location-actions.ts)),
geocoding free text to lat/lng via the **existing** geocoder — new
`geocodePlace(query)` in [geocode.ts](../../apps/web/src/lib/geocode.ts) reuses
the MapTiler/Nominatim path (no new dependency, no migration). Both location
controls are grouped and shown only on the search tabs (the Following feed
isn't location-scoped). **Radius** moved out of "More filters" to a primary
control that appears whenever a location is active
([event-filter-form.tsx](../../apps/web/src/app/events/_components/event-filter-form.tsx)).
_Not done (intentional, would be a separate finding): reverse-geocoding the
active coords back to a place name in the chip / input (shows "Within N km",
not the city)._

### D. Consistency / design-system polish

#### F-12 — The page's own controls bypass the shared vocabulary · **P3** · ✅ resolved 2026-06-01

Cross-refs persona-ux CC-1/CC-3 and m3-alignment. All three drifts fixed:

- [near-me-button.tsx](../../apps/web/src/app/events/near-me-button.tsx) now uses
  `secondaryButtonClass('sm')` (was a hand-rolled class) and an SVG map-pin (was
  a 📍 emoji) — matching the new `LocationSearch` Search button beside it.
- [event-timeframe-tabs.tsx](../../apps/web/src/app/events/_components/event-timeframe-tabs.tsx)
  active tab + count badge now use the `text-primary-fg` / `bg-primary-fg/20`
  tokens (were `text-white` / `bg-white/20`).
- Both files reformatted from 4-space to the repo's 2-space norm.

---

## Remediation log

### 2026-06-01 — Discovery first bundle

Shipped the high-leverage card-quality items + auto-apply + the P1 correctness
gap. Verified `pnpm typecheck && lint && test && build` (build re-run after a
concurrent-session SIGTERM race over the shared `.next/`). Journal:
[2026-06-01-find-events-discovery-bundle.md](../journal/2026-06-01-find-events-discovery-bundle.md).

- **F-1 ✅** — pagination (fetch 30→120, `PAGE_SIZE = 12`, shared `Pagination`).
- **F-2 ✅** — price chip (`Free` / `$10` / `$10/team` / `From $X`) from divisions.
- **F-3 ✅** — whole-card stretched link + `focus-within` ring.
- **F-4 ◐** — capacity badge on the card (Upcoming/Past); Following-feed half closed in the follow-up below.
- **F-5 ✅** — auto-apply filters (`router.push` + `useTransition`), no-JS fallback kept.
- **F-8 ✅** — result count in the subheader.
- Extracted [event-filter-options.ts](../../apps/web/src/app/events/_components/event-filter-options.ts)
  so the server page reads real constant arrays after the filter form became
  `'use client'` (the `'use client'`-breaks-exported-constants gotcha — see
  journal "Patterns observed").

### 2026-06-01 — Following-feed capacity (F-4 follow-up)

Closed the deferred half of F-4 so the capacity badge lights up on the
Following tab too. Migration-free. Journal:
[2026-06-01-following-feed-capacity.md](../journal/2026-06-01-following-feed-capacity.md).

- **F-4 ✅** — `searchFollowingFeed` reads `events_view` (computed
  `attendee_count`) + the primary division's `capacity_kind`/`max_spots` from the
  skill-hydrate query, computing `spots_remaining` like the search RPC;
  `spotsRemaining` added to `FollowingFeedItem` and threaded through the page's
  Following mapping.
- _Price on the Following card remains open_ (folds into F-2 — needs the
  primary division's price projected onto `FollowingFeedItem`).

### 2026-06-01 — Price filter (F-6)

Added a Free/Paid filter, in-memory over the fetched set (no migration).
Journal: [2026-06-01-price-filter.md](../journal/2026-06-01-price-filter.md).

- **F-6 ✅** — `Price: Any / Free / Paid` select in the primary filter row;
  page filters `events` with the exported `isEventFree(divisions)` (free = green
  chip; paid = complement) before pagination, so the count + pages reflect the
  filtered set. Scoped to Upcoming/Past (the Following feed has no division
  prices); the param is dropped when switching to Following. New shared
  `PRICES`/`PriceFilter`/`PRICE_FILTER_LABEL` in `event-filter-options.ts`;
  chip + removal wired through `ActiveFilterChips`.
- _Price on the Following card still open_ (F-2 follow-up).

### 2026-06-01 — Manual location + primary radius (F-7)

Closed the last open P2. Migration-free, reuses the existing geocoder.
Journal: [2026-06-01-manual-location.md](../journal/2026-06-01-manual-location.md).

- **F-7 ✅** — `LocationSearch` (City/ZIP) beside Near-me geocodes free text via
  the new `geocodePlace(query)` (extracted a shared `geocodeQuery` in
  `geocode.ts`, reusing the MapTiler/Nominatim path) through a thin
  `geocodePlaceAction`. Sets `lat`/`lng`/`radiusKm` and resets `page`, like
  Near-me. Location controls grouped + gated to the search tabs. Radius promoted
  from "More filters" to a primary control shown whenever a location is active.
- _Reverse-geocoding coords → place name in the chip/input deferred_ (would be a
  new, separate finding).

### 2026-06-01 — P3 polish: sort + design-system (F-9, F-12)

First P3 bundle. Both migration-free.
Journal: [2026-06-01-find-events-p3-polish.md](../journal/2026-06-01-find-events-p3-polish.md).

- **F-9 ✅** — `Sort` select (Date / Nearest / Price: low to high) in the
  filter-form footer; in-memory sort before the pagination slice, nulls last;
  "Nearest" only when a location is active; non-Following only. New shared
  `SORTS`/`SortOption`/`SORT_LABEL`.
- **F-12 ✅** — Near-me button → `secondaryButtonClass` + SVG pin (matches the
  adjacent `LocationSearch` button); timeframe tabs → `text-primary-fg` /
  `bg-primary-fg/20` tokens; both files reformatted to 2-space.

### 2026-06-01 — Relative date labels (F-10)

Journal: [2026-06-01-relative-event-dates.md](../journal/2026-06-01-relative-event-dates.md).

- **F-10 ✅** — cards lead with Today / Tomorrow / short-weekday (0–6 days),
  else the absolute date. New pure `relativeEventDay(startsAt, timeZone, now)` in
  `date-formats.ts` (+ unit test) anchors "today" to the event timezone and
  takes `now` from the server boundary (pure server component). Per-card labels,
  not day-group headers (which would fight pagination).

### 2026-06-01 — Card thumbnails (F-13)

Journal: [2026-06-01-card-thumbnails.md](../journal/2026-06-01-card-thumbnails.md).

- **F-13 ✅** — 16:9 thumbnail atop each card: the event `hero_image_url` via
  `next/image`, else a surface-tinted placeholder + faint volleyball glyph.
  Migration-free — `SupabaseEventRepository.search` merges `hero_image_url` from
  `events_view` by result id (`loadHeroImageUrls`, degrades to placeholder on
  error) rather than altering the `search_events` RPC; the Following feed reads
  it off its existing `events_view` query. `heroImageUrl` added to
  `VolleyballEventSummary` + `FollowingFeedItem`. Thumbnail sits under the
  stretched link, so the whole card stays one click target.
