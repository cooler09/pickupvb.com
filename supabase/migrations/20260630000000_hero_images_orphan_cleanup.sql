-- ============================================================================
-- Hero images orphan cleanup — pg_cron walker over storage.objects.
-- See docs/audits/data-lifecycle.md (P3 #2) and docs/audits/hero-images.md.
--
-- Context: the hero-image feature stores uploads as objects in the
-- `hero-images` Supabase Storage bucket under
-- `{user_id}/{entity_type}/{entity_id}/hero.{ext}`, with the resulting
-- public URL written back to `events.hero_image_url` /
-- `groups.hero_image_url` / `profiles.hero_image_url`. Nothing currently
-- removes objects when:
--   - the parent entity is hard-deleted (events) or soft-deleted
--     (groups/profiles — `deleted_at is not null` after Bundles 93 / 94),
--   - the host re-uploads with a different file extension (the old
--     `hero.jpg` survives next to the new `hero.png`),
--   - the host clears the hero (`saveHeroImageUrl(..., null)` in
--     apps/web/src/app/hero-image-actions.ts).
-- The placeholder note at the bottom of 20260627000000_retention_cron_jobs.sql
-- flagged this as deferred; this migration ships the walker.
--
-- Impact: additive. Adds one SECURITY DEFINER helper
-- `public.purge_hero_image_orphans(grace_hours int)` and one pg_cron job
-- scheduled daily at 06:00 UTC. The function deletes rows from
-- `storage.objects` for objects whose `(entity_type, entity_id)` no
-- longer resolves to a live row whose `hero_image_url` references the
-- object's path. A `grace_hours` argument (default 24h) shields freshly
-- uploaded objects from being purged before the corresponding DB row
-- update lands. First scheduled run will purge any existing orphans in
-- the dev DB. Re-running cron.schedule with the same job name is
-- idempotent (pg_cron upserts by jobname).
-- ============================================================================

create extension if not exists pg_cron;

-- Walker. Returns the number of storage.objects rows deleted.
--
-- Liveness rule per entity_type:
--   events   — row exists (events has no soft-delete yet; tracked separately
--              as P2 #5 in data-lifecycle.md) AND hero_image_url ends with
--              the object's storage path.
--   groups   — row exists, deleted_at is null, hero_image_url ends with path.
--   profiles — row exists, deleted_at is null, hero_image_url ends with path.
--
-- The "URL ends with path" check is what catches stale-extension uploads
-- (`hero.jpg` left behind when the new upload is `hero.png`) and explicit
-- clears (`hero_image_url` set to NULL).
--
-- Storage.objects has a `protect_delete` BEFORE-DELETE trigger that blocks
-- direct SQL deletion unless the session GUC `storage.allow_delete_query`
-- is set to 'true'. The trigger exists to push callers through the Storage
-- HTTP API; setting the GUC inside this SECURITY DEFINER function is the
-- supported escape hatch for server-side maintenance. Note that the
-- Supabase storage backend reconciles blob-level cleanup off the
-- `storage.objects` table, so removing the row is enough — there is no
-- separate blob-delete step to make here.
--
-- search_path is locked to '' for SECURITY DEFINER hygiene; every table
-- and function is referenced with its schema.
create or replace function public.purge_hero_image_orphans(p_grace_hours int default 24)
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
      (storage.foldername(o.name))[2] as entity_type,
      (storage.foldername(o.name))[3] as entity_id
    from storage.objects o
    where o.bucket_id = 'hero-images'
      and o.created_at < now() - make_interval(hours => p_grace_hours)
  ),
  live as (
    select c.name
      from cand c
      join public.events e on e.id::text = c.entity_id
     where c.entity_type = 'events'
       and e.hero_image_url like '%/' || c.name
    union
    select c.name
      from cand c
      join public.groups g on g.id::text = c.entity_id
     where c.entity_type = 'groups'
       and g.deleted_at is null
       and g.hero_image_url like '%/' || c.name
    union
    select c.name
      from cand c
      join public.profiles p on p.id::text = c.entity_id
     where c.entity_type = 'profiles'
       and p.deleted_at is null
       and p.hero_image_url like '%/' || c.name
  ),
  orphans as (
    select c.name from cand c
    where c.name not in (select name from live)
  ),
  deleted as (
    delete from storage.objects o
     using orphans
     where o.bucket_id = 'hero-images'
       and o.name = orphans.name
     returning 1
  )
  select count(*) into v_deleted from deleted;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.purge_hero_image_orphans(int) from public;
grant execute on function public.purge_hero_image_orphans(int) to postgres;

-- Daily orphan sweep. 06:00 UTC keeps it well clear of the retention
-- purge jobs in 20260627000000_retention_cron_jobs.sql (04:00–05:00 UTC).
select cron.schedule(
  'hero_images_purge_orphans',
  '0 6 * * *',
  $$ select public.purge_hero_image_orphans(24) $$
);
