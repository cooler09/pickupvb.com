-- ============================================================================
-- Private players — opt out of discovery (directory / search / team invites).
--
-- Context: every non-deleted profile is exposed through `profiles_public` and
-- surfaces in three discovery paths — the /players directory, the name-search
-- typeahead, and the "add a teammate / add a member" pickers (both read
-- profiles_public via ProfileQueries.searchCards). Some players don't want to be
-- discoverable: findable, searchable, or addable to someone else's team. This
-- adds a single per-player preference for that.
--
-- Impact: new column `profiles.discoverable boolean not null default true` —
-- existing rows are discoverable, matching today's behaviour. The column is
-- added to the `profiles_public` projection so the anon directory client and the
-- session-scoped picker can filter on it; the discovery reads
-- (SupabaseProfileRepository.searchDirectory / searchCards) add
-- `discoverable = true`. The view is NOT filtered by discoverable, and the
-- by-id / by-handle card lookups are deliberately left unfiltered, so a private
-- player still resolves on event rosters, attendee/sender chips, and their own
-- /players/[handle] page — "private" means not discoverable, not deleted. View
-- rebuilt DROP+CREATE (matches 20260921000000) to keep column order stable;
-- grants re-applied. No existing read/write breaks.
-- ============================================================================

alter table public.profiles
  add column if not exists discoverable boolean not null default true;

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
    -- Whether the player opts into discovery (directory / search / team invites).
    -- Exposed so the anon directory + the session-scoped picker can filter; the
    -- view itself stays unfiltered so card-by-id reads still resolve everyone.
    discoverable,
    theme_preference,
    created_at
  from public.profiles
  where deleted_at is null;
grant select on public.profiles_public to anon, authenticated;
