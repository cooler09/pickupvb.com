-- ============================================================================
-- Pin the privileged columns on public.media_posts — security audit P2 #16.
--
-- Context: `media_posts_update` (20260820000000) gates UPDATE on
-- `submitter_user_id = auth.uid() OR is_event_host(event_id) OR is_platform_admin()`
-- but does NOT restrict WHICH columns the submitter may change. Postgres RLS
-- WITH CHECK can't reference the OLD row, so the policy alone can't stop a
-- submitter from PATCH-ing `featured` / `status` / `report_count` directly via
-- PostgREST — bypassing the host-gated `feature_event_stream` RPC (self-promote
-- a video into the one featured-stream slot on someone else's event) and the
-- report auto-hide (flip `status` back to 'active' after the 3-report
-- threshold). The application layer (media-post.handler.ts) already authorizes
-- these correctly; this is the missing DB-level enforcement for direct-API
-- callers.
--
-- Impact: adds one BEFORE UPDATE trigger function + trigger. No schema change,
-- no column change, no generated-types change. Behaviour change is enforcement
-- only — every legitimate app write still passes:
--   * Submitter editing title/description/url      → status/featured unchanged.
--   * Submitter soft-removing own post (`remove()`) → status -> 'removed'
--     (allowed) and featured -> false (a de-curation, allowed).
--   * Submitter ending own live stream             → featured -> false (allowed).
--   * Host/admin hide/unhide/feature/unfeature/remove → the host/admin branch
--     skips the guard entirely (`is_event_host` / `is_platform_admin`).
--   * `feature_event_stream` (SECURITY DEFINER) + `media_posts_after_report`
--     (SECURITY DEFINER) run as the function owner, not the API role, so the
--     `current_user` bypass lets them maintain featured/status/report_count.
-- What's now rejected for a direct (anon/authenticated) non-host write:
--   featured false->true, status -> 'active' (resurrection), report_count edits.
--
-- The guard is SECURITY INVOKER (the default — deliberately NOT definer) so
-- `current_user` reflects the role that issued the UPDATE: 'authenticated' /
-- 'anon' for a direct PostgREST call, but the owning role ('postgres') inside a
-- SECURITY DEFINER function and 'service_role' for the admin client — the two
-- trusted paths. `media_posts_insert` is intentionally left unchanged: posting a
-- video to any event is community behaviour, and the only escalation it enabled
-- (self-featuring) is closed here.
-- ============================================================================

create or replace function public.media_posts_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Trusted writers bypass: anything that isn't a direct API-role write.
  --   * SECURITY DEFINER paths (feature_event_stream, media_posts_after_report)
  --     execute as the function owner ('postgres'), not 'authenticated'.
  --   * The admin client connects as 'service_role'.
  --   * The event host / platform admin are authorized to moderate + curate.
  if current_user not in ('anon', 'authenticated')
     or public.is_event_host(old.event_id)
     or public.is_platform_admin() then
    return new;
  end if;

  -- From here: a direct API write by a non-host, non-admin user. RLS already
  -- restricts UPDATE to the submitter of this row. They may edit content and
  -- soft-remove or self-hide, but must not promote into the host-curated
  -- featured slot, resurrect a moderated post to 'active', or touch the counter.
  if new.featured and not old.featured then
    raise exception 'Only an event host can feature a media post'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and new.status = 'active' then
    raise exception 'Only an event host or admin can restore a media post to active'
      using errcode = '42501';
  end if;

  if new.report_count is distinct from old.report_count then
    raise exception 'report_count is maintained by the moderation trigger, not direct writes'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists media_posts_guard_privileged on public.media_posts;
create trigger media_posts_guard_privileged
  before update on public.media_posts
  for each row execute function public.media_posts_guard_privileged_columns();
