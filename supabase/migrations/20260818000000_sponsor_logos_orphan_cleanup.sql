-- ============================================================================
-- Sponsor logos orphan cleanup — pg_cron walker over storage.objects.
-- Mirrors the hero-images walker (20260630000000_hero_images_orphan_cleanup.sql).
-- See docs/audits/data-lifecycle.md (P3 #2).
--
-- Context: the sponsor-logo feature (20260817000000_sponsor_logos_bucket.sql)
-- stores uploads in the `sponsor-logos` bucket under
-- `{user_id}/{event_id}/logo.{ext}`, with the resulting public URL written
-- back to `event_sponsors.logo_url`. Nothing removes the object when:
--   - the event is deleted (event_sponsors cascades via the event_id FK, so
--     the sponsor row vanishes but the Storage object lingers),
--   - the sponsor is removed (`removeSponsor` deletes the row),
--   - the host clears/replaces the logo (the new upload may land at a
--     different extension — `logo.png` left beside the new `logo.webp`),
--   - an à-la-carte unlock is started (logo uploaded) but checkout is
--     abandoned, so the webhook never materializes a row.
--
-- Impact: additive. Adds one SECURITY DEFINER helper
-- `public.purge_sponsor_logo_orphans(grace_hours int)` and one daily pg_cron
-- job at 06:15 UTC (clear of the 04:00–05:00 retention purges and the 06:00
-- hero sweep). A `grace_hours` argument (default 24h) shields freshly
-- uploaded objects from being purged before the sponsor row (or the
-- post-checkout webhook) lands. Re-running cron.schedule with the same job
-- name is idempotent (pg_cron upserts by jobname).
--
-- Divergence from the hero walker — cache-buster tolerance: both upload
-- widgets append `?t=<ms>` to the stored URL so a re-upload to the same path
-- defeats the CDN cache. A bare `logo_url like '%/' || name` therefore never
-- matches a live row (the `?t=…` suffix sits past `name`), which would treat
-- every live logo as an orphan. This walker matches the bare path OR the path
-- followed by a `?<query>` suffix so live rows are correctly retained. The
-- hero walker (which has the same `?t=` suffix on its URLs) lacks this guard
-- and should get the same fix in a follow-up.
-- ============================================================================

create extension if not exists pg_cron;

-- Walker. Returns the number of storage.objects rows deleted.
--
-- Liveness rule: the `event_sponsors` row for `(storage.foldername(name))[2]`
-- (the event_id segment) exists AND its `logo_url` references this object's
-- path — either as the bare path tail or with a `?<cache-buster>` suffix.
-- The event_sponsors → events FK is ON DELETE CASCADE, so a deleted event
-- removes the sponsor row and the object falls through to orphan here; no
-- separate events join is needed.
--
-- Storage.objects has a `protect_delete` BEFORE-DELETE trigger that blocks
-- direct SQL deletion unless the session GUC `storage.allow_delete_query`
-- is 'true'. Setting it inside this SECURITY DEFINER function is the
-- supported escape hatch for server-side maintenance; removing the
-- storage.objects row is sufficient (the storage backend reconciles the
-- blob), so there is no separate blob-delete step.
--
-- search_path is locked to '' for SECURITY DEFINER hygiene; every table and
-- function is schema-qualified.
create or replace function public.purge_sponsor_logo_orphans(p_grace_hours int default 24)
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
      (storage.foldername(o.name))[2] as event_id
    from storage.objects o
    where o.bucket_id = 'sponsor-logos'
      and o.created_at < now() - make_interval(hours => p_grace_hours)
  ),
  live as (
    select c.name
      from cand c
      join public.event_sponsors s on s.event_id::text = c.event_id
     where s.logo_url like '%/' || c.name
        or s.logo_url like '%/' || c.name || '?%'
  ),
  orphans as (
    select c.name from cand c
    where c.name not in (select name from live)
  ),
  deleted as (
    delete from storage.objects o
     using orphans
     where o.bucket_id = 'sponsor-logos'
       and o.name = orphans.name
     returning 1
  )
  select count(*) into v_deleted from deleted;

  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.purge_sponsor_logo_orphans(int) from public;
grant execute on function public.purge_sponsor_logo_orphans(int) to postgres;

-- Daily orphan sweep. 06:15 UTC keeps it clear of the retention purge jobs
-- (04:00–05:00 UTC) and the hero sweep (06:00 UTC).
select cron.schedule(
  'sponsor_logos_purge_orphans',
  '15 6 * * *',
  $$ select public.purge_sponsor_logo_orphans(24) $$
);
