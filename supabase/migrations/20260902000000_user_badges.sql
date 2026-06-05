-- ============================================================================
-- Gamification Phase 1 — system achievement badges (collector badges).
-- See docs/adr/0031-gamification-badges.md
--
-- Context: introduces a durable, idempotent store for the achievement badges a
-- player earns (Champion, Regular, First Whistle, …). The earn *thresholds*
-- live in TypeScript (packages/domain `badge-catalog.ts`) — this migration owns
-- only (a) the grant store, (b) the public read projection, and (c) a pure
-- aggregation RPC that counts the facts the TS rules consume. Keeping the
-- thresholds out of SQL is deliberate: the application reconcile use-case is the
-- single grant decision point, so there is no second copy to drift.
--
-- Impact: additive. New table `user_badges`, new view `user_badges_public`
-- (granted to anon + authenticated, the only path other users read someone's
-- badges), and two SECURITY DEFINER RPCs:
--   * compute_player_badge_stats(uuid) — read-only fact aggregation.
--   * set_user_badge_hidden(text, boolean) — owner-only display opt-out.
-- No existing reads/writes change. Grants are written by the service role from
-- the reconcile use-case (system-awarded, session-less), so there is no client
-- INSERT policy; the owner SELECTs their own rows and toggles `hidden` only
-- through the definer RPC.
-- ============================================================================

create table public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Free-form so it can hold a system catalog key, an easter-egg key, or a host
  -- badge reference (Phase 2). `source` discriminates which vocabulary applies.
  badge_key text not null,
  source text not null default 'system' check (source in ('system', 'host', 'easter_egg')),
  -- Opaque grant-time context (e.g. {"eventId": "..."}). Never required.
  context jsonb,
  -- Owner opted this badge out of public display (still visible to themselves).
  hidden boolean not null default false,
  awarded_at timestamptz not null default now(),
  -- One grant per (user, badge) for system + easter-egg badges. Host badges
  -- (Phase 2) carry their uniqueness on event_badge_grants, not here.
  unique (user_id, badge_key)
);

create index user_badges_user_idx on public.user_badges (user_id);

alter table public.user_badges enable row level security;

-- Owner can read all of their own badges (including hidden ones) on a
-- user-scoped client. Everyone else reads the `user_badges_public` view below.
create policy user_badges_select_own
  on public.user_badges
  for select
  using (user_id = auth.uid());

-- No client INSERT/UPDATE/DELETE policies: grants are service-role writes from
-- the reconcile use-case, and the only owner mutation (hide/unhide) goes through
-- set_user_badge_hidden() so a user can never forge or relabel a badge_key.

-- ---------------------------------------------------------------------------
-- Public read projection. Definer view (no security_invoker) so anon +
-- authenticated callers read it without a base-table policy — mirrors
-- profiles_public. Hidden badges and soft-deleted accounts are filtered out.
-- ---------------------------------------------------------------------------
create view public.user_badges_public as
  select
    ub.user_id,
    ub.badge_key,
    ub.source,
    ub.awarded_at
  from public.user_badges ub
  join public.profiles p on p.id = ub.user_id
  where ub.hidden = false
    and p.deleted_at is null;

grant select on public.user_badges_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fact aggregation for the badge rules. Read-only; returns one row of counts.
-- The TS catalog turns these counts into grants — this function never decides a
-- threshold. SECURITY DEFINER so the reconcile path (service role or the owner
-- viewing their profile) sees the full picture regardless of per-table RLS.
--
-- Phase 1 computes the four attendance/hosting facts that derive cleanly from
-- well-understood tables. The three tournament/league facts
-- (tournament_championships, tournament_podiums, leagues_completed) are returned
-- as 0 for now — wiring them needs the bracket/league result schema verified
-- against a live DB, deferred to a follow-up migration so we never mis-award a
-- high-visibility "Champion" badge off untested join logic. The badge catalog
-- still defines those badges, so the UI shows them as locked teasers until then.
-- ---------------------------------------------------------------------------
create function public.compute_player_badge_stats(p_user_id uuid)
returns table (
  published_event_count integer,
  attended_event_count integer,
  distinct_positions_played integer,
  tournament_championships integer,
  tournament_podiums integer,
  leagues_completed integer,
  max_events_with_single_host integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with attended as (
    -- Distinct past, non-cancelled events the user actually attended, with the
    -- host of each (a surviving participant row on a finished event == attended;
    -- leaving an upcoming event deletes the row). role = 'attendee' excludes the
    -- collapsed free-agent rows (migration 20260802000000) so only real RSVPs
    -- count toward attendance milestones.
    select distinct ed.event_id, e.host_id
    from public.event_participants ep
    join public.event_divisions ed on ed.id = ep.division_id
    join public.events e on e.id = ed.event_id
    where ep.user_id = p_user_id
      and ep.role = 'attendee'
      and e.status in ('published', 'completed')
      and e.ends_at < now()
  ),
  per_host as (
    select host_id, count(*) as n
    from attended
    group by host_id
  )
  select
    (select count(*)::integer
       from public.events
      where host_id = p_user_id
        and status = 'published')                                       as published_event_count,
    (select count(*)::integer from attended)                            as attended_event_count,
    (select count(distinct ep.position)::integer
       from public.event_participants ep
       join public.event_divisions ed on ed.id = ep.division_id
       join public.events e on e.id = ed.event_id
      where ep.user_id = p_user_id
        and ep.role = 'attendee'
        and ep.position is not null
        and e.status in ('published', 'completed')
        and e.ends_at < now())                                         as distinct_positions_played,
    0::integer                                                          as tournament_championships,
    0::integer                                                          as tournament_podiums,
    0::integer                                                          as leagues_completed,
    coalesce((select max(n) from per_host), 0)::integer                as max_events_with_single_host;
$$;

revoke all on function public.compute_player_badge_stats(uuid) from public;
grant execute on function public.compute_player_badge_stats(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Owner-only display opt-out. Flips `hidden` for one of the caller's own
-- badges; a no-op for anyone else's row. Definer + the auth.uid() guard mean a
-- user can change visibility but never forge or relabel a badge_key.
-- ---------------------------------------------------------------------------
create function public.set_user_badge_hidden(p_badge_key text, p_hidden boolean)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.user_badges
     set hidden = p_hidden
   where user_id = auth.uid()
     and badge_key = p_badge_key;
$$;

revoke all on function public.set_user_badge_hidden(text, boolean) from public;
grant execute on function public.set_user_badge_hidden(text, boolean) to authenticated;
