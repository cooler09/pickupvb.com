-- ============================================================================
-- Group avatars — teach the avatar orphan-sweep walker about `groups.avatar_url`.
--
-- Context: group avatars (logos) now upload through the same `avatars` Storage
-- bucket as user avatars (20260830000000_user_avatars.sql), but under a
-- group-scoped path: `{user_id}/groups/{group_id}/avatar.webp`. The leading
-- `{user_id}/` segment satisfies the bucket's owner-path RLS unchanged, so no
-- new policy is needed. BUT the existing `purge_avatar_orphans` walker only
-- considers an object live if some `profiles.avatar_url` references it — a group
-- avatar matches no profile, so the nightly sweep would reap every group avatar
-- after the grace window (the same P1 data-loss class fixed for hero images in
-- 20260819000000). This migration adds a second liveness branch over
-- `groups.avatar_url` so group avatars survive.
--
-- Impact: function body only — `CREATE OR REPLACE FUNCTION` over the same
-- `purge_avatar_orphans(int)` signature; the pg_cron job (`avatars_purge_orphans`)
-- is unchanged and keeps calling it. No schema columns, no new bucket, no RLS
-- change, no generated-types change. The user-avatar liveness branch is
-- byte-for-byte the same; only the `union`-ed group branch is new.
--
-- Liveness rules (an object in `avatars` is live if EITHER holds):
--   • profiles branch — owner's profile exists, not soft-deleted, and its
--     `avatar_url` references the object (bare tail OR `?t=` cache-buster form).
--   • groups branch — the path is `{uid}/groups/{gid}/…`, group `gid` exists,
--     is not soft-deleted, and its `avatar_url` references the object. The join
--     is on the group id in the 3rd path segment (indexed PK), and the
--     `[2] = 'groups'` guard keeps single-segment user-avatar paths out of it.
-- ============================================================================

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
    -- User avatars: live if the owning profile references the object.
    select c.name
      from cand c
      join public.profiles p on p.id::text = c.owner_id
     where p.deleted_at is null
       and (p.avatar_url like '%/' || c.name
            or p.avatar_url like '%/' || c.name || '?%')
    union
    -- Group avatars: path is `{uid}/groups/{gid}/avatar.webp`; live if group
    -- `gid` references the object. Join on the group id in the 3rd segment.
    select c.name
      from cand c
      join public.groups g
        on g.id::text = (storage.foldername(c.name))[3]
     where (storage.foldername(c.name))[2] = 'groups'
       and g.deleted_at is null
       and (g.avatar_url like '%/' || c.name
            or g.avatar_url like '%/' || c.name || '?%')
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
