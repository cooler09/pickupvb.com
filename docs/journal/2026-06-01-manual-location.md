# Manual location + primary radius (F-7) (2026-06-01)

## Context

Closes finding **F-7** in [find-events-ux.md](../audits/find-events-ux.md) —
the last open P2 on the events listing page. The location story was
GPS-or-nothing: the only way to scope `/events` to a place was the Near-me
button (one-shot `navigator.geolocation`). Deny the prompt, or want to browse
another city, and there was no fallback. Radius — the main knob once a location
is set — was buried inside the "More filters" disclosure.

## Decisions

- **Reuse the existing geocoder; no new dependency, no migration.** Event
  create/edit already geocode through `lib/geocode.ts` (MapTiler in prod,
  Nominatim fallback in dev). `maptilerGeocodeOne` takes any free-text query, so
  a city/ZIP lookup is the same call. Extracted a private `geocodeQuery(q)` that
  both `geocodeAddress` (structured, throws on miss) and the new
  `geocodePlace(query)` (free text, returns null on miss) delegate to — DRY
  without touching the create/edit contract.
- **Mirror Near-me's client pattern, not a server `place` param.** `LocationSearch`
  is a `'use client'` box that geocodes via a thin `geocodePlaceAction` and then
  `router.push`es with `lat`/`lng`/`radiusKm` (resetting `page`), exactly like
  Near-me. This keeps **one** location representation in the URL (coords) rather
  than introducing a parallel `?place=` that the server would geocode on every
  render. The action returns `coords | null` (not a typed error) and the box
  shows a toast on null — the right shape for a client-invoked action per
  AGENTS.md (§ server-action error handling), and intentionally simpler than the
  detailed errors event create/edit surface.
- **Group location controls and gate them to the search tabs.** Near-me +
  City/ZIP now sit together and render only when `when !== 'following'` — the
  Following feed isn't location-scoped (and `buildHref` already drops location
  params for it), so showing them there was a no-op/confusing. Near-me was
  previously always visible; hiding it on Following is a small correctness
  improvement folded into this finding.
- **Promote radius to a primary control.** Moved the Radius field out of "More
  filters" to a top-level control that appears whenever a location is active,
  and dropped `location` from `advancedActive` so the disclosure no longer
  auto-opens just because coords are set.
- **Reverse-geocoding deferred.** The chip still reads "Within N km", not the
  city name — turning coords back into a label is a separate concern (and a
  separate finding if we want it).

## Changes

- [geocode.ts](../../apps/web/src/lib/geocode.ts) — extracted `geocodeQuery`;
  added `geocodePlace(query)`; `geocodeAddress` now delegates (same contract).
- [location-actions.ts](../../apps/web/src/app/events/location-actions.ts) —
  **new** `'use server'` `geocodePlaceAction(query)` → `coords | null`.
- [location-search.tsx](../../apps/web/src/app/events/location-search.tsx) —
  **new** City/ZIP search box (geocode → push with coords, reset page, toast on miss).
- [page.tsx](../../apps/web/src/app/events/page.tsx) — render `LocationSearch` +
  `NearMeButton` as a group, only on the search tabs.
- [event-filter-form.tsx](../../apps/web/src/app/events/_components/event-filter-form.tsx)
  — Radius moved from the advanced `<details>` to a primary control;
  `advancedActive` no longer keys off `location`.

## Patterns observed

- **`maptilerGeocodeOne(q)` is the reusable free-text geocode primitive.** Any
  surface that needs "string → lat/lng" (search box, future autocomplete) can
  call it; `geocodeQuery` is now the shared chokepoint with the dev fallback.

## Follow-ups

- **Reverse-geocode the active location** to show the place name (chip/input)
  instead of just the radius — would need a reverse endpoint; new finding if
  pursued.
- Find-events backlog is now **P3-only**: F-9 sort, F-10 relative dates, F-11
  filter-chrome consolidation, F-12 design-system polish (incl. the Near-me
  button's hand-rolled class — `LocationSearch` already uses `secondaryButtonClass`),
  F-13 card thumbnails. Tracked in [find-events-ux.md](../audits/find-events-ux.md).
