-- ============================================================================
-- Gamification — make on_attend host-badge grants reach TEAM events
-- (tournaments + leagues) and free agents, not just open-play attendees.
-- See docs/adr/0031-gamification-badges.md, docs/audits/badges.md (BA-9).
--
-- Context: `grant_attended_event_badges` / `grant_attended_badges_for_event`
-- (20260903000000 + 20261010000000) decide "who attended event X" by joining
-- ONLY `event_participants` with role='attendee'. That table is populated for
-- open-play individual signups, but a TEAM event (tournament/league) stores its
-- registrants in `event_team_entries` (+ `event_team_entry_members`, + the
-- entry's `captain_id`) and never writes an `event_participants` row. Free
-- agents land in `event_participants` but with role='free_agent', which the
-- `= 'attendee'` filter also excludes. Net effect: an on_attend host badge on a
-- team event (or for a free agent) was NEVER granted — the badge feature only
-- worked for open play. Confirmed against dev: a finished team tournament with 4
-- team entries had 0 `event_participants` rows, so its on_attend badge reached
-- nobody.
--
-- This migration centralizes the "attended event X" definition in one SQL
-- helper and rewires both grant RPCs + the reconcile cron's candidate query to
-- use it, so all three agree on the same union:
--   A) individual participants — role in ('attendee','free_agent')   [open play
--      attendees + free agents anywhere]
--   B) rostered team members with an account
--      (event_team_entry_members.user_id)                            [team play]
--   C) team captains with an account (event_team_entries.captain_id) [team play]
-- Account-less walk-in teams/members (user_id null) have no user to award and
-- are skipped; soft-deleted entries (deleted_at) are excluded.
--
-- Impact: no schema/RLS change — three functions redefined, two added.
--   * NEW `event_attendee_ids(uuid)` — setof user_id for one event (the A∪B∪C
--     union). SECURITY DEFINER (reads RLS-protected registration tables as a
--     system computation); not granted to clients — only the definer functions
--     below call it.
--   * `grant_attended_event_badges(uuid)` — same return shape (badge_key,label),
--     now matches via the user→events form of the union (starts from the user's
--     own memberships so the profile-view hot path stays index-friendly).
--   * `grant_attended_badges_for_event(uuid)` — same void return, now grants via
--     `event_attendee_ids`.
--   * NEW `badge_reconcile_candidate_ids(since, now)` — setof user_id of every
--     attendee (A∪B∪C) of events that finished in [since, now]; the reconcile
--     cron calls it so team members who never revisit their profile still
--     collect via the nightly safety net. Replaces the cron's old
--     event_participants-only attendee query.
-- Generated types hand-edited for the two new functions; regen on next
-- gen:types.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The single source of truth for "who attended event X". Event→users form,
-- reused by the per-event grant and the cron candidate set. The per-user grant
-- (grant_attended_event_badges) encodes the SAME three sources in the opposite
-- (user→events) direction for index efficiency on the profile-view hot path —
-- keep the two in sync.
-- ---------------------------------------------------------------------------
create or replace function public.event_attendee_ids(p_event_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  -- A) individual participants: open-play attendees + free agents
  select ep.user_id
    from public.event_divisions ed
    join public.event_participants ep on ep.division_id = ed.id
   where ed.event_id = p_event_id
     and ep.role in ('attendee', 'free_agent')
     and ep.user_id is not null
  union
  -- B) rostered team members that have an account (tournaments + leagues)
  select m.user_id
    from public.event_divisions ed
    join public.event_team_entries te
      on te.division_id = ed.id and te.deleted_at is null
    join public.event_team_entry_members m on m.entry_id = te.id
   where ed.event_id = p_event_id
     and m.user_id is not null
  union
  -- C) team captains that registered with an account (covers a team whose
  --    roster is empty, e.g. an ad-hoc team registered by its captain)
  select te.captain_id
    from public.event_divisions ed
    join public.event_team_entries te
      on te.division_id = ed.id and te.deleted_at is null
   where ed.event_id = p_event_id
     and te.captain_id is not null;
$$;

revoke all on function public.event_attendee_ids(uuid) from public;
grant execute on function public.event_attendee_ids(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- BA-6 grant RPC — now team-aware. Same return shape (the inserted rows, as
-- (badge_key, label)); `on conflict do nothing` ⇒ the returned set is exactly
-- the NEW grants, so the facade fires one bell/toast per newly-collected badge.
-- The CTE is the user→events projection of the A∪B∪C union; it must stay in
-- sync with `event_attendee_ids` (the event→users form).
-- ---------------------------------------------------------------------------
create or replace function public.grant_attended_event_badges(p_user_id uuid)
returns table (badge_key text, label text)
language sql
volatile
security definer
set search_path = ''
as $$
  with attended as (
    -- A) individual participation (attendee or free agent)
    select ed.event_id
      from public.event_divisions ed
      join public.event_participants ep on ep.division_id = ed.id
     where ep.user_id = p_user_id
       and ep.role in ('attendee', 'free_agent')
    union
    -- B) rostered on a team
    select ed.event_id
      from public.event_divisions ed
      join public.event_team_entries te
        on te.division_id = ed.id and te.deleted_at is null
      join public.event_team_entry_members m on m.entry_id = te.id
     where m.user_id = p_user_id
    union
    -- C) captain of a team
    select ed.event_id
      from public.event_divisions ed
      join public.event_team_entries te
        on te.division_id = ed.id and te.deleted_at is null
     where te.captain_id = p_user_id
  )
  insert into public.user_badges (user_id, badge_key, source, context)
  select
    p_user_id,
    eb.id::text,
    'host',
    jsonb_build_object('eventId', e.id::text, 'label', eb.label, 'iconUrl', eb.icon_url)
  from public.event_badges eb
  join public.events e on e.id = eb.event_id
  join attended a on a.event_id = e.id
  where eb.grant_rule = 'on_attend'
    and e.status in ('published', 'completed')
    and e.ends_at < now()
  on conflict (user_id, badge_key) do nothing
  returning user_badges.badge_key, (user_badges.context ->> 'label');
$$;

revoke all on function public.grant_attended_event_badges(uuid) from public;
grant execute on function public.grant_attended_event_badges(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- BA-7 event-scoped backfill — now team-aware via event_attendee_ids. Run when
-- a host adds an on_attend badge so every past attendee (incl. team members /
-- captains / free agents) collects it without a profile visit. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.grant_attended_badges_for_event(p_event_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.user_badges (user_id, badge_key, source, context)
  select
    a.user_id,
    eb.id::text,
    'host',
    jsonb_build_object('eventId', e.id::text, 'label', eb.label, 'iconUrl', eb.icon_url)
  from public.event_badges eb
  join public.events e on e.id = eb.event_id
  join public.event_attendee_ids(eb.event_id) a on true
  where eb.event_id = p_event_id
    and eb.grant_rule = 'on_attend'
    and e.status in ('published', 'completed')
    and e.ends_at < now()
  on conflict (user_id, badge_key) do nothing;
$$;

revoke all on function public.grant_attended_badges_for_event(uuid) from public;
grant execute on function public.grant_attended_badges_for_event(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reconcile-cron candidate set — every attendee (A∪B∪C) of an event that
-- finished within [p_since, p_now]. Replaces the cron's old
-- event_participants/attendee-only query so team members who never revisit
-- their profile still collect via the nightly run. The cron dedupes + caps in
-- TS, so this returns the raw union.
-- ---------------------------------------------------------------------------
create or replace function public.badge_reconcile_candidate_ids(
  p_since timestamptz,
  p_now   timestamptz
)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.user_id
  from public.events e
  cross join lateral public.event_attendee_ids(e.id) a
  where e.status in ('published', 'completed')
    and e.ends_at >= p_since
    and e.ends_at <= p_now;
$$;

revoke all on function public.badge_reconcile_candidate_ids(timestamptz, timestamptz) from public;
grant execute on function public.badge_reconcile_candidate_ids(timestamptz, timestamptz) to service_role;
