-- ============================================================================
-- Fix hero-image orphan walker — cache-buster tolerance in the liveness check.
-- Redefines public.purge_hero_image_orphans (originally
-- 20260630000000_hero_images_orphan_cleanup.sql). See docs/audits/data-lifecycle.md.
--
-- Context: HeroImageUpload (apps/web/src/components/hero-image-upload.tsx)
-- persists the public URL with a `?t=<ms>` cache-buster appended
-- (`${data.publicUrl}?t=${Date.now()}`) so a re-upload to the same path
-- defeats the CDN cache. The original walker's liveness check matched with
-- `hero_image_url like '%/' || c.name` — a LIKE with no trailing wildcard,
-- so the `?t=…` suffix sitting past the object name means the pattern never
-- matches a live row. Result: after the 24h grace window every live hero
-- image is classified as an orphan and the daily 06:00 UTC cron deletes it,
-- so hero images would disappear roughly a day after upload. The sibling
-- sponsor-logo walker (20260818000000_sponsor_logos_orphan_cleanup.sql)
-- shipped with the guard; this migration backports it to hero.
--
-- Impact: behaviour-only fix to one SECURITY DEFINER function. No schema or
-- signature change. The existing `hero_images_purge_orphans` cron job calls
-- this function by name, so it picks up the new body automatically — no
-- re-schedule needed. The walker still deletes genuine orphans (deleted
-- parent, stale-extension re-upload, explicit clear to NULL); it now also
-- correctly *retains* live cache-busted URLs. grant/revoke are re-asserted
-- idempotently. No backfill: any live hero wrongly purged before this lands
-- is already gone and unrecoverable from here — this only stops future loss.
-- ============================================================================

-- Liveness rule per entity_type (unchanged from the original except for the
-- cache-buster guard): the parent row is live AND its hero_image_url
-- references the object's path — either as the bare path tail (`'%/' || name`)
-- or with a `?<cache-buster>` suffix (`'%/' || name || '?%'`). The bare branch
-- still catches pre-cache-buster URLs and any caller that stored a clean URL.
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
       and (e.hero_image_url like '%/' || c.name
            or e.hero_image_url like '%/' || c.name || '?%')
    union
    select c.name
      from cand c
      join public.groups g on g.id::text = c.entity_id
     where c.entity_type = 'groups'
       and g.deleted_at is null
       and (g.hero_image_url like '%/' || c.name
            or g.hero_image_url like '%/' || c.name || '?%')
    union
    select c.name
      from cand c
      join public.profiles p on p.id::text = c.entity_id
     where c.entity_type = 'profiles'
       and p.deleted_at is null
       and (p.hero_image_url like '%/' || c.name
            or p.hero_image_url like '%/' || c.name || '?%')
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
