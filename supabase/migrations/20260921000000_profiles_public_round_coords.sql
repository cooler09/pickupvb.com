-- ============================================================================
-- Privacy #17 (P2) — bound the precision of player coordinates exposed to anon.
-- See docs/audits/privacy.md #17.
--
-- Context: 20260901000000_profiles_geo added latitude/longitude (geocoded from
-- the free-text `home_city`) to the anon-readable `profiles_public` view at the
-- geocoder's full precision. `home_city` accepts a full street address, which
-- MapTiler geocodes to rooftop precision, so a player's exact home coordinate can
-- be published to the whole internet and is bulk-queryable through the view. The
-- "players near me" directory only needs ~metro proximity, so full precision buys
-- nothing.
--
-- Impact: rebuilds `profiles_public` to round the published coords to 2 decimal
-- places (~1.1 km) — enough for the bounding-box filter + distance chip in
-- SupabaseProfileRepository.searchDirectory, but no longer pinpointing a home.
-- Full precision is retained on the owner-only base `profiles` row (latitude /
-- longitude columns) in case it's ever needed server-side. The round result is
-- cast back to double precision so the view column type is unchanged → generated
-- types are unaffected. DROP+CREATE (matches 20260901000000) to keep column order
-- stable; grants re-applied. No app-code change.
-- ============================================================================

drop view if exists public.profiles_public;
create view public.profiles_public as
  select
    id,
    handle,
    display_name,
    avatar_url,
    hero_image_url,
    home_city,
    -- Rounded to ~1.1 km so the directory's proximity filter still works without
    -- publishing a pinpoint home coordinate (privacy #17).
    round(latitude::numeric, 2)::double precision  as latitude,
    round(longitude::numeric, 2)::double precision as longitude,
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
