-- ============================================================================
-- Hero images — add hero_image_url to events, groups, and profiles.
-- Creates the `hero-images` Supabase Storage bucket with public-read /
-- authenticated-write RLS policies.
--
-- Context: wide banner images (3:1 ratio) displayed at the top of event
-- detail, group, and public profile pages. Hosts upload via a file picker
-- in the edit forms; the URL is stored here and served via Next.js image
-- optimization. See docs/audits/hero-images.md for the full proposal.
--
-- Impact: additive only — three new nullable text columns. Existing rows
-- get NULL; the display components fall back to a branded gradient.
-- The storage bucket is new; no existing reads are affected.
-- ============================================================================

-- Schema columns
alter table public.events   add column if not exists hero_image_url text;
alter table public.groups   add column if not exists hero_image_url text;
alter table public.profiles add column if not exists hero_image_url text;

-- Add hero_image_url to the profiles_public view so public/anon queries
-- can display profile banners without touching the base profiles table.
-- DROP + CREATE required: CREATE OR REPLACE VIEW only allows appending
-- columns, not inserting mid-list; dropping avoids the column-rename error.
drop view if exists public.profiles_public;
create view public.profiles_public as
  select
    id,
    handle,
    display_name,
    avatar_url,
    hero_image_url,
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

-- Re-grant (create or replace may drop existing grants in some PG versions)
grant select on public.profiles_public to anon, authenticated;

-- Storage bucket (public = anyone can read the served URLs)
insert into storage.buckets (id, name, public)
values ('hero-images', 'hero-images', true)
on conflict (id) do nothing;

-- Public read: any visitor can load hero images
create policy "hero images public read"
  on storage.objects for select
  to public
  using (bucket_id = 'hero-images');

-- Authenticated write: users can only write inside their own user_id path prefix.
-- Path convention: {user_id}/{entity_type}/{entity_id}/hero.{ext}
create policy "hero images owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'hero-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "hero images owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'hero-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "hero images owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'hero-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
