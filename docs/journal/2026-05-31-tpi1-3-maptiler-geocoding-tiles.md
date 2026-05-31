# TPI-1/2/3 — geocoding + map tiles off free OSM, onto MapTiler (2026-05-31)

## Context

Third-party-integrations audit, the last two P2s: address **typeahead**
([autocomplete route](../../apps/web/src/app/api/geocode/autocomplete/route.ts))
hit Photon + Nominatim, and the event map
([event-map.tsx](../../apps/web/src/components/event-map.tsx)) shipped OSM's
public tile server. Both are free OSM services whose usage policies **forbid the
way we used them** (Nominatim explicitly bans autocomplete; the tile policy bans
production volume) — and they don't bill, they **IP-ban**, so at scale address
entry + maps break for everyone on the Vercel egress IP with no code change on our
side. Vendor chosen earlier: **MapTiler** (one account covers both geocoding and
tiles). TPI-2 (the server-side single geocode on event create/edit) rode along.

## Decisions

- **Two keys, by necessity — not laziness.** A browser tile key must be
  referrer-restricted (it's exposed in tile URLs), but a referrer-restricted key
  can't authorize _server-side_ geocoding requests (no browser Origin/Referer). So
  `MAPTILER_API_KEY` (server, geocoding) is distinct from
  `NEXT_PUBLIC_MAPTILER_KEY` (browser, tiles, domain-restricted).
- **Keep OSM as a no-key dev fallback, don't delete it.** Matches the repo's
  "works without keys in dev" convention (Stripe/Resend/PostHog all soft-fail).
  Keyed → MapTiler (prod); unkeyed → Photon/Nominatim + OSM tiles (dev only).
  Critically, on a MapTiler **outage** in prod, autocomplete degrades to _empty
  suggestions_ (manual entry still works) — it does **not** fall back to OSM,
  because that would put production volume back on the banned endpoints.
- **Unit-test the parser, not the network.** The real risk in a geocoder swap is
  the response→suggestion mapping (MapTiler's `context[]` id prefixes, `[lon,lat]`
  order, house-number-in-`address`). Extracted a pure `parseMapTilerFeatures` and
  pinned it with 5 cases; the fetch/key plumbing is thin around it.
- **Shared module, because route files can't export helpers.** Put the client in
  `lib/maptiler.ts` (consumed by both the route and `lib/geocode.ts`) — a Next
  `route.ts` may only export handlers (learned in the TPI-14 bundle).
- **Perf bonus was already done.** `EventMap` is already dynamic-imported
  (`ssr:false`) via `event-map-lazy.tsx`, so the Leaflet bundle is already off
  map-less pages. Only the tile URL needed swapping (+ `maxZoom` + attribution).

## Changes

- **New** [lib/maptiler.ts](../../apps/web/src/lib/maptiler.ts) +
  [maptiler.test.ts](../../apps/web/src/lib/maptiler.test.ts) (5 tests).
- [autocomplete route](../../apps/web/src/app/api/geocode/autocomplete/route.ts)
  - [geocode.ts](../../apps/web/src/lib/geocode.ts) — MapTiler-when-keyed, OSM dev
    fallback.
- [event-map.tsx](../../apps/web/src/components/event-map.tsx) — MapTiler tiles +
  `maxZoom` + attribution, OSM fallback.
- `next.config.mjs` CSP — `img-src` += `https://api.maptiler.com` (+ comment).
- `.env.example` + `docs/integrations.md` — the two keys + provider docs;
  Photon/Nominatim/Leaflet reclassified as dev fallbacks.
- `vitest.config.ts` — aliased `server-only` → `src/test/server-only-stub.ts` so
  server modules are unit-testable (first server-only unit test in the repo).

Verify quad green (web 95 tests, lint 0 errors, build 8/8).

## Verification owed

Set `MAPTILER_API_KEY` + `NEXT_PUBLIC_MAPTILER_KEY` on dev, then: type an address
→ suggestions come from MapTiler (not OSM); open an event with a location → the
map renders MapTiler tiles. (The parser is already unit-covered; this confirms the
live keys + restrictions.)

## Status

Every audit **P2 is now closed or code-complete-pending-verify** — TPI-1/2/3
landed here; TPI-7 (bell → Broadcast) awaits its live dev round-trip. Remaining: 3
P3 (TPI-6 webhook orphan sweep, TPI-11 lazy Sentry Replay, TPI-13 PostHog flush
batching) + the TPI-7 visibility-gating follow-up.
