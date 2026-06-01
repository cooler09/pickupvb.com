-- ============================================================================
-- Profiles geo: latitude/longitude for player "near me" discovery
-- (players-page-ux PL-5).
--
-- Context: the /players directory previously matched location only as a
-- free-text substring on `home_city`, so proximity search ("players near me",
-- with a radius) was impossible — "Virginia Beach" and "VA Beach" never met.
-- The app now geocodes a profile's `home_city` to lat/lng on save (the
-- `updateProfile` action, reusing the same geocoder events use). This migration
-- adds the columns to store it and exposes them on `profiles_public` so the
-- sessionless anon directory can run a bounding-box proximity filter + show
-- distance. Deliberately NO PostGIS geo column / RPC: the directory uses a
-- lat/lng bounding box + a JS haversine distance. The events stack uses PostGIS
-- (`geo geography` + `st_dwithin`), but player discovery doesn't need
-- circle-exact radius, and a view-backed bbox keeps the read on `profiles_public`.
--
-- Impact: additive — two nullable columns on `profiles`, surfaced on the
-- `profiles_public` view (DROP+CREATE to keep them adjacent to `home_city`;
-- grants re-applied). Existing rows have NULL coords until their owner next
-- saves their profile (geocoding is an external HTTP call, so there is no SQL
-- backfill); a profile with NULL coords simply never matches a near-me filter.
-- No existing read/write breaks: every prior `profiles_public` column is
-- preserved in the same order, plus the two new ones.
-- ============================================================================

alter table public.profiles
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;

-- Rebuild profiles_public to surface the coords. DROP+CREATE (not CREATE OR
-- REPLACE) so we can place latitude/longitude next to home_city rather than
-- only appending — mirrors 20260625000000_hero_images.sql. Column set is the
-- prior view's 18 columns + latitude + longitude.
drop view if exists public.profiles_public;
create view public.profiles_public as
  select
    id,
    handle,
    display_name,
    avatar_url,
    hero_image_url,
    home_city,
    latitude,
    longitude,
    primary_position,
    secondary_position,
    tertiary_position,
    instagram_handle,
    tiktok_handle,
    twitter_handle,
    facebook_handle,
    youtube_handle,
    website_url,
    show_pro_badge,
    theme_preference,
    created_at
  from public.profiles
  where deleted_at is null;
grant select on public.profiles_public to anon, authenticated;
