-- ===========================================================================
-- PII audit P1 #4 — profiles_public view (safe column projection)
--
-- profiles has a single permissive SELECT policy (using (true)) that exposes
-- every column, including business_name, business_address, tax_id, and
-- first_name / last_name. The full fix is three steps:
--
--   Step 1 (this migration): create a profiles_public view that projects
--     only the columns intended for public display and grant it to
--     anon + authenticated. The view filters out soft-deleted profiles
--     (deleted_at IS NULL) so tombstoned accounts disappear from public
--     reads automatically.
--
--   Step 2 (future bundle): switch every public-facing query site
--     (player pages, attendee chips, host chips, search results) to
--     read from this view instead of the base table.
--
--   Step 3 (future bundle, after step 2): tighten the profiles SELECT
--     policy to owner-only + platform-admin for the full row. Until
--     step 2 is complete, tightening the base-table policy would break
--     all public profile reads.
--
-- The view is created without security_invoker = on (default in PostgreSQL
-- 15+), meaning it runs as the view owner (postgres / superuser) and
-- bypasses RLS on the base table — this is intentional so that anon
-- callers can query the view without needing a permissive base-table
-- policy once step 3 ships.
-- ===========================================================================

create view public.profiles_public as
  select
    id,
    handle,
    display_name,
    avatar_url,
    home_city,
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
