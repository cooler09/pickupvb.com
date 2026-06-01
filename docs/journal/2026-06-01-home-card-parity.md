# Homepage event-card parity (H-1) (2026-06-01)

## Context

Closes **H-1** in [home-page-ux.md](../audits/home-page-ux.md), the headline
finding from the freshly-created landing-page UX audit. The homepage "Upcoming
events" peek reused the shared `EventCard` but fed it a **stripped**
`EventCardData` — `spotsRemaining: null`, `distanceKm: null`, and none of
`heroImageUrl` / `divisions` / price / `relativeDay` / `timeZone` /
`isFundraiser` / series. So every card improvement that landed on `/events`
earlier the same day (price chip F-2, capacity/`Full` badge F-4, relative dates
F-10, hero thumbnail F-13 — all in [find-events-ux.md](../audits/find-events-ux.md))
was invisible on the highest-traffic page, and the homepage always rendered the
placeholder thumbnail and never warned on a Full event.

## Decisions

- **Render-only — don't touch the query.** The peek already calls the same
  `handlers.searchEvents` the listing page uses, and its result type
  `VolleyballEventSummary` already carries every dropped field. So the fix is
  purely the JSX mapping: map the full shape exactly like
  [events/page.tsx](../../apps/web/src/app/events/page.tsx) does. Zero new query,
  no migration, no repo change.
- **Compute `relativeDay` at the page boundary, not in the card.** Threaded
  `relativeEventDay(e.startsAt, e.timeZone, now)` using the `now` the page
  already declared, keeping the homepage a pure server component (no `Date.now()`
  in render — pitfall #4). Mirrors how the listing page does it.
- **Mirror the listing page's mapping verbatim rather than invent a homepage
  variant.** The two now feed `EventCard` identically, so future card fields
  light up on both surfaces without a second edit — and there's one less place
  for the homepage to silently lag the listing page again.
- **Left the `distanceKm` field mapped through even though the homepage peek has
  no location** (`searchEvents` returns `null` for it without a `near` arg). The
  card hides the distance span when `distanceKm === null`, so passing it is
  correct and forward-compatible if the peek ever becomes location-scoped (H-2).

## Changes

- [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx) — import
  `relativeEventDay`; the `upcomingEvents.map(...)` now maps the full
  `EventCardData` (`timeZone`, `heroImageUrl`, `relativeDay`, real
  `spotsRemaining`/`distanceKm`, `seriesName`/`seriesPosition`/`seriesSize`,
  `isFundraiser`, `divisions`) instead of the stripped subset.

## Patterns observed

- **A shared presentational component is only as good as its worst caller.**
  `EventCard` is the canonical card, but a caller that hand-maps a degraded
  subset silently opts out of every future improvement. When a component grows a
  new optional field, grep its call sites — a `: null` literal where a real field
  exists is the tell. (Both homepage offenders were literal `spotsRemaining:
null` / `distanceKm: null`.) Not promoting to AGENTS.md yet — one instance — but
  worth watching if it recurs.

## Follow-ups

Remaining landing-page items, all in
[home-page-ux.md](../audits/home-page-ux.md):

- **H-2 (P3)** — hero "Find events near me" CTA + the peek aren't
  location-scoped; copy over-promises proximity.
- **H-3 (P3)** — the peek section vanishes entirely when empty instead of
  showing a host nudge.
- **H-4 (P3)** — the group card is hand-rolled on both the homepage and
  `/groups` and already drifting → extract a shared `GroupCard`.
- **H-6 (P3, optional)** — the page treats a returning signed-in player like a
  visitor (no personalization / Following peek).
- **H-5** — anon host CTAs route into a mid-form wall; tracked by persona-ux
  **V-4**.
