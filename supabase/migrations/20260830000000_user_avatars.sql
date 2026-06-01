-- ============================================================================
-- User avatars — Storage bucket + owner-path RLS + orphan-sweep walker.
--
-- Context: `profiles.avatar_url` has existed since the init migration
-- (20260512000000_init.sql) and is read across the app — attendee rosters
-- (apps/web/src/components/attendee-list.tsx), the messaging sender cards,
-- player/group directory cards — all with an initials fallback. But nothing
-- ever *wrote* it: there was no upload path, so every user rendered initials.
-- This migration stands up the write side, mirroring the hero-image feature
-- (20260625000000_hero_images.sql + 20260630000000_hero_images_orphan_cleanup.sql):
-- a public `avatars` bucket, owner-path RLS, and a daily orphan sweep.
--
-- A dedicated bucket (not the shared `hero-images` one) is deliberate: the
-- `purge_hero_image_orphans` walker deletes any object in `hero-images` not
-- referenced by some `hero_image_url`, so an avatar parked there would be
-- reaped on the next nightly sweep. Separate buckets keep each walker's
-- liveness check scoped to its own column.
--
-- Impact: additive only. No schema columns are added — `avatar_url` already
-- exists on `profiles` and is already exposed in the `profiles_public` view
-- (20260621000000_pii_p1_profiles_public_view.sql), so reads need no change.
-- One new Storage bucket, four RLS policies on storage.objects, one
-- SECURITY DEFINER walker, and one pg_cron job. Existing rows are unaffected;
-- the display components keep falling back to initials until a user uploads.
-- ============================================================================

-- Storage bucket (public = anyone can read the served avatar URLs)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read: any visitor can load avatars (they appear on public rosters
-- and player/group cards served to anon viewers).
create policy "avatars public read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- Authenticated write: users may only write inside their own user_id path
-- prefix. Path convention: {user_id}/avatar.{ext}
create policy "avatars owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- Orphan sweep — pg_cron walker over storage.objects (mirrors the hero-image
-- walker, scoped to the single profiles parent).
--
-- Liveness rule: the avatar's owning profile still exists, is not soft-deleted,
-- and its avatar_url references the object's path. The AvatarUpload component
-- (apps/web/src/components/avatar-upload.tsx) persists the public URL with a
-- `?t=<ms>` cache-buster appended, so the liveness check must tolerate either
-- the bare path tail (`'%/' || name`) or the cache-busted form
-- (`'%/' || name || '?%'`) — a bare LIKE with no trailing wildcard would never
-- match a live row and the cron would delete every live avatar after the grace
-- window (the P1 data-loss bug fixed for hero in 20260819000000).
--
-- This catches: deleted/soft-deleted owner, stale-extension re-upload
-- (avatar.jpg left behind when the new upload is avatar.png), and explicit
-- clears (avatar_url set to NULL). The grace window (default 24h) shields a
-- freshly uploaded object from being purged before the avatar_url update lands.
--
-- storage.objects has a `protect_delete` BEFORE-DELETE trigger; setting the
-- `storage.allow_delete_query` GUC inside this SECURITY DEFINER function is the
-- supported escape hatch for server-side maintenance. search_path is locked to
-- '' for SECURITY DEFINER hygiene.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

create or replace function public.purge_avatar_orphans(p_grace_hours int default 24)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  perform set_config('storage.allow_delete_query', 'true', true);

  with cand as (
    select
      o.name,
      (storage.foldername(o.name))[1] as owner_id
    from storage.objects o
    where o.bucket_id = 'avatars'
      and o.created_at < now() - make_interval(hours => p_grace_hours)
  ),
  live as (
    select c.name
      from cand c
      join public.profiles p on p.id::text = c.owner_id
     where p.deleted_at is null
       and (p.avatar_url like '%/' || c.name
            or p.avatar_url like '%/' || c.name || '?%')
  ),
  orphans as (
    select c.name from cand c
    where c.name not in (select name from live)
  ),
  deleted as (
    delete from storage.objects o
     using orphans
     where o.bucket_id = 'avatars'
       and o.name = orphans.name
     returning 1
  )
  select count(*) into v_deleted from deleted;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.purge_avatar_orphans(int) from public;
grant execute on function public.purge_avatar_orphans(int) to postgres;

-- Daily orphan sweep. 06:05 UTC sits just after the hero sweep (06:00) and
-- well clear of the retention purge jobs (04:00–05:00 UTC). Re-running
-- cron.schedule with the same job name is idempotent (pg_cron upserts by name).
select cron.schedule(
  'avatars_purge_orphans',
  '5 6 * * *',
  $$ select public.purge_avatar_orphans(24) $$
);
