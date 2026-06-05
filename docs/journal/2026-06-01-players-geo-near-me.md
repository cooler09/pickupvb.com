# Players "near me" — profiles geo (PL-5, staged) (2026-06-01)

## Context

Closes the last open players-directory finding,
[players-page-ux.md](../audits/players-page-ux.md) **PL-5**: the directory's
"find people in your area" was a free-text `home_city` substring match (no
radius, "VA Beach" ≠ "Virginia Beach"). This adds geocoded profile coordinates +
a bounding-box near-me filter, mirroring the events near-me UX.

**Staged, not DB-applied.** Local Supabase (Docker) was down, so per the user's
call I built it as a _staged_ bundle: the migration is written but **not applied
to a real DB**, and `database.types.ts` was **hand-bridged** (latitude/longitude
added by hand) so the verify chain passes. The migration + type regen must be run
when Docker is up — see Follow-ups.

## Decisions

- **Bounding box, not PostGIS.** Events use a `geo geography` column +
  `st_dwithin` in an RPC. For player discovery I added plain
  `profiles.latitude/longitude` and filter a lat/lng box in `searchDirectory`
  (`gte/lte` on `profiles_public`) + a JS haversine for the displayed distance.
  Lighter (no PostGIS column/RPC, no big SQL function to regen types for), runs
  on the view-backed anon read, and "within ~N km" is plenty for finding people.
  Trade-off: ordering stays alphabetical (no global nearest-first — that'd need
  PostGIS distance ordering); the radius _filter_ + per-card distance are the
  value. Noted as a deferred enhancement.
- **Geocode `home_city` on save, written directly (not through the aggregate).**
  The `UserProfile` aggregate's own doc says peripheral/derived columns
  (theme/hero/avatar/business) are written by their actions, not threaded through
  `editDetails`. Geocoded coords are derived from `home_city` and purely a
  search/display concern, so the `updateProfile` action geocodes (web-layer
  concern — `geocodePlace`, the events geocoder) and writes lat/lng directly,
  best-effort (a geocode miss or cleared city just nulls the coords). No domain
  threading, no second aggregate field.
- **Reuse the events location UI via a `basePath` prop.** `NearMeButton` and
  `LocationSearch` were `/events`-hardcoded; gave them `basePath?: Route =
'/events'` (events callers unchanged) and reused them on `/players` with
  `basePath="/players"`. Replaced the weak "Home city" text input with the geo
  controls + a "within N km · Clear" line. The name-search GET form carries
  hidden lat/lng/radiusKm so a name search preserves an active location.
- **`as unknown as` cast for the dynamic select.** Because the directory select
  column list is now built dynamically (`CARD_COLUMNS ± coords`), supabase-js
  can't statically parse it and types the rows as a `ParserError`; the row cast
  needs `as unknown as DirectoryRow[]` (the compiler literally suggests it).
- **No SQL backfill.** Geocoding is an HTTP call, impossible in a migration, so
  existing profiles get coords lazily on their next save; until then they have
  NULL coords and simply don't appear in near-me results. Fine for the current
  scale.

## Changes

- [supabase/migrations/20260901000000_profiles_geo.sql](../../supabase/migrations/20260901000000_profiles_geo.sql)
  — `profiles.latitude/longitude` + `profiles_public` DROP/CREATE adding them.
- [database.types.ts](../../packages/supabase/src/database.types.ts) —
  **hand-bridged** latitude/longitude onto profiles + profiles*public (Row +
  Insert/Update), scoped so `groups.home_city` was untouched. \_Provisional —
  re-run `gen:types`.*
- [profile-queries.ts](../../packages/domain/src/users/profile-queries.ts) —
  `ProfileDirectoryQuery.near`, `ProfileCard.distanceKm`.
- [supabase-profile-repository.ts](../../packages/infrastructure/src/supabase-profile-repository.ts)
  — `haversineKm` + bbox filter + distance in `searchDirectory`.
- [profile/actions.ts](../../apps/web/src/app/profile/actions.ts) —
  geocode-on-save.
- [events/near-me-button.tsx](../../apps/web/src/app/events/near-me-button.tsx) /
  [events/location-search.tsx](../../apps/web/src/app/events/location-search.tsx)
  — `basePath` prop.
- [players/page.tsx](../../apps/web/src/app/players/page.tsx) — geo parsing,
  `near`, location controls, distance display.

## Patterns observed

- **Hand-bridging generated types is a viable stopgap when the local DB is
  down** — add only the columns the migration adds, scope to the right
  table/view, and flag it loudly for re-`gen:types`. But it's exactly that: a
  stopgap. The migration SQL itself was never executed here, so the real
  verification (SQL validity + the `profiles_public` rebuild) is still pending.

## Follow-ups

- **MUST, before deploy:** start Docker, `pnpm db:migrate`,
  `pnpm --filter @pickupvb/supabase gen:types`, confirm the regenerated
  latitude/longitude match the hand-bridged columns (no diff), and sanity-check
  the `profiles_public` rebuild + a near-me query.
- **Nearest-first ordering** (global, across pages) needs PostGIS distance
  ordering like events — deferred.
- **Backfill** existing profiles' coords (a one-off script calling the geocoder)
  if near-me adoption matters before users naturally re-save.
