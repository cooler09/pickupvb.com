-- ============================================================================
-- Gamification Phase 2 — host-authored event badges (Pro feature).
-- See docs/adr/0031-gamification-badges.md
--
-- Context: builds on Phase 1 (20260902000000_user_badges.sql). Pro hosts can
-- attach collectible badges to their event ("I was at Summer Slam"); attendees
-- earn them and they show in the same trophy case as system badges. Authoring
-- is the net-new Pro capability (same framing as the sponsor slot,
-- 20260817000000) — the gate lives in the application layer, not RLS.
--
-- Design choice — no separate grants table: a host-badge grant is written into
-- the Phase-1 `user_badges` table with source='host' and badge_key = the
-- event_badge id, snapshotting label/icon into `context`. This reuses the whole
-- Phase-1 read path (listForUser / user_badges_public / the trophy case) instead
-- of a parallel table + view. The `user_badges (user_id, badge_key)` unique
-- constraint gives one grant per (player, event_badge) for free.
--
-- Impact: additive.
--   - New table `event_badges` (child of events; public SELECT, manage gated to
--     event hosts via is_event_host()).
--   - New public Storage bucket `event-badges` for icon uploads + owner-prefix
--     RLS (clone of sponsor-logos) and a daily orphan-sweep walker.
--   - `user_badges_public` gains a trailing `context` column so other viewers
--     can render a host badge's label/icon (non-PII).
--   - `grant_attended_event_badges(uuid)` — on_attend auto-grant RPC, run from
--     the same reconcile path as the system badges.
-- ============================================================================

create table public.event_badges (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  sort_order  integer not null default 0,
  label       text not null check (length(btrim(label)) between 1 and 40),
  description text check (description is null or length(description) <= 140),
  icon_url    text check (icon_url is null or icon_url ~* '^https://'),
  grant_rule  text not null default 'on_attend' check (grant_rule in ('on_attend', 'host_grant')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.event_badges is
  'Host-authored collectible badges per event (gamification Phase 2). Authoring is gated to Pro hosts in the application layer; RLS only enforces "can manage this event". Grants land in user_badges (source=host).';

create index event_badges_event_idx on public.event_badges (event_id, sort_order);

create function public.touch_event_badges_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_event_badges_touch
  before update on public.event_badges
  for each row execute function public.touch_event_badges_updated_at();

alter table public.event_badges enable row level security;

-- Public read: the "badges you can earn here" block renders on the event page
-- to anyone who can see the event (same posture as event_sponsors).
create policy event_badges_select on public.event_badges for select using (true);

-- Manage: the event manager set (host / co-host / host-group owner-admin),
-- encapsulated in the existing is_event_host(uuid) SECURITY DEFINER RPC.
create policy event_badges_insert on public.event_badges for insert
  with check (public.is_event_host(event_id));
create policy event_badges_update on public.event_badges for update
  using (public.is_event_host(event_id));
create policy event_badges_delete on public.event_badges for delete
  using (public.is_event_host(event_id));

-- ---------------------------------------------------------------------------
-- Storage bucket for badge icons — clone of sponsor-logos
-- (20260817000000_sponsor_logos_bucket.sql). Public read, owner-prefix write.
-- Path convention: {user_id}/{event_id}/badges/{badge_id}.{ext}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('event-badges', 'event-badges', true)
on conflict (id) do nothing;

create policy "event badges public read"
  on storage.objects for select to public
  using (bucket_id = 'event-badges');

create policy "event badges owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-badges' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "event badges owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'event-badges' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "event badges owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-badges' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Add `context` to the public projection so other viewers can render a host
-- badge's snapshotted label/icon. Appended at the end (Postgres only allows
-- appending columns to create-or-replace view).
-- ---------------------------------------------------------------------------
create or replace view public.user_badges_public as
  select
    ub.user_id,
    ub.badge_key,
    ub.source,
    ub.awarded_at,
    ub.context
  from public.user_badges ub
  join public.profiles p on p.id = ub.user_id
  where ub.hidden = false
    and p.deleted_at is null;

grant select on public.user_badges_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- on_attend auto-grant. For every on_attend badge of every past event the user
-- attended, write a host grant into user_badges (idempotent). Run from the same
-- reconcile path as the system badges (profile view + cron). This is a pure
-- per-event membership grant — no thresholds — so it lives in SQL without the
-- TS-threshold-drift concern that keeps the *system* rules in TypeScript.
-- ---------------------------------------------------------------------------
create function public.grant_attended_event_badges(p_user_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.user_badges (user_id, badge_key, source, context)
  select
    p_user_id,
    eb.id::text,
    'host',
    jsonb_build_object('eventId', e.id::text, 'label', eb.label, 'iconUrl', eb.icon_url)
  from public.event_badges eb
  join public.events e on e.id = eb.event_id
  join public.event_divisions ed on ed.event_id = e.id
  join public.event_participants ep on ep.division_id = ed.id
  where ep.user_id = p_user_id
    and ep.role = 'attendee'
    and eb.grant_rule = 'on_attend'
    and e.status in ('published', 'completed')
    and e.ends_at < now()
  on conflict (user_id, badge_key) do nothing;
$$;

revoke all on function public.grant_attended_event_badges(uuid) from public;
grant execute on function public.grant_attended_event_badges(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Orphan-sweep walker for the event-badges bucket. Clone of
-- purge_sponsor_logo_orphans (20260818000000) — public bucket, so liveness
-- matches the bare path tail OR the path + '?<cache-buster>' (AGENTS pattern
-- #14). Liveness join is event_badges.icon_url keyed on the event_id path
-- segment [2].
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

create function public.purge_event_badge_orphans(p_grace_hours int default 24)
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
    select o.name, (storage.foldername(o.name))[2] as event_id
    from storage.objects o
    where o.bucket_id = 'event-badges'
      and o.created_at < now() - make_interval(hours => p_grace_hours)
  ),
  live as (
    select c.name
      from cand c
      join public.event_badges eb on eb.event_id::text = c.event_id
     where eb.icon_url like '%/' || c.name
        or eb.icon_url like '%/' || c.name || '?%'
  ),
  orphans as (
    select c.name from cand c where c.name not in (select name from live)
  ),
  deleted as (
    delete from storage.objects o
     using orphans
     where o.bucket_id = 'event-badges' and o.name = orphans.name
     returning 1
  )
  select count(*) into v_deleted from deleted;
  return coalesce(v_deleted, 0);
end;
$$;

revoke all on function public.purge_event_badge_orphans(int) from public;
grant execute on function public.purge_event_badge_orphans(int) to postgres;

-- 06:30 UTC — clear of the retention purges (04:00–05:00), the hero sweep
-- (06:00) and the sponsor-logo sweep (06:15).
select cron.schedule(
  'event_badges_purge_orphans',
  '30 6 * * *',
  $$ select public.purge_event_badge_orphans(24) $$
);
