-- ============================================================================
-- Gamification — make on_attend host-badge grants observable + backfillable
-- (badges audit BA-6 + BA-7).
-- See docs/adr/0031-gamification-badges.md, docs/audits/badges.md
--
-- Context: on_attend host badges are granted by `grant_attended_event_badges`,
-- which returned `void` — so the web facade couldn't tell which grants were NEW
-- and fired no `badge.earned` bell/toast (BA-6: a player's first collectible
-- badge landed silently). And that RPC only ran on the owner's profile view —
-- the reconcile cron never called it, so an attendee who never revisits their
-- profile, or one whose event finished outside the cron's 7-day lookback when
-- the host *added* the badge, never collected it (BA-7).
--
-- This migration:
--   * BA-6 — changes `grant_attended_event_badges(uuid)` to RETURN the rows it
--     actually inserted (`on conflict do nothing` ⇒ the returned set is exactly
--     the new grants), as (badge_key, label). The facade notifies per row. The
--     return-type change needs a drop+recreate (Postgres won't `create or
--     replace` across a new return type).
--   * BA-7 — adds `grant_attended_badges_for_event(uuid)`, an event-scoped
--     backfill that grants every on_attend badge of one event to all its past
--     attendees in a single statement (idempotent). Called when a host adds an
--     on_attend badge, so attendees of an already-finished event collect it
--     without a profile visit.
--
-- Impact: `grant_attended_event_badges` return type changes (undefined →
-- setof (badge_key text, label text)); generated types hand-edited to match,
-- regen on next gen:types. New function `grant_attended_badges_for_event`.
-- Both SECURITY DEFINER (user_badges has no client INSERT policy — grants are
-- system writes), execute granted to authenticated + service_role. No table/RLS
-- changes. The grant logic (which badges, which attendees) is identical to the
-- prior body — only the shape and scope differ.
-- ============================================================================

drop function if exists public.grant_attended_event_badges(uuid);

create function public.grant_attended_event_badges(p_user_id uuid)
returns table (badge_key text, label text)
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
  on conflict (user_id, badge_key) do nothing
  returning user_badges.badge_key, (user_badges.context ->> 'label');
$$;

revoke all on function public.grant_attended_event_badges(uuid) from public;
grant execute on function public.grant_attended_event_badges(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- BA-7: event-scoped backfill. Grants every on_attend badge of one event to all
-- of that event's past attendees (idempotent). Run when a host adds an on_attend
-- badge, so attendees of an already-finished event collect it without waiting on
-- a profile view or the 7-day cron window. The grant set is identical to what a
-- per-user reconcile would produce for this event, so it's safe for any
-- authenticated caller (the host action already authorized "can manage").
-- Returns void — the host action doesn't fan out a bell to every attendee
-- (it would be slow and is not the add-badge flow's job); backfilled badges
-- surface in the trophy case and via the next per-user reconcile's bell.
-- ---------------------------------------------------------------------------
create function public.grant_attended_badges_for_event(p_event_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.user_badges (user_id, badge_key, source, context)
  select
    ep.user_id,
    eb.id::text,
    'host',
    jsonb_build_object('eventId', e.id::text, 'label', eb.label, 'iconUrl', eb.icon_url)
  from public.event_badges eb
  join public.events e on e.id = eb.event_id
  join public.event_divisions ed on ed.event_id = e.id
  join public.event_participants ep on ep.division_id = ed.id
  where eb.event_id = p_event_id
    and ep.role = 'attendee'
    and eb.grant_rule = 'on_attend'
    and e.status in ('published', 'completed')
    and e.ends_at < now()
  on conflict (user_id, badge_key) do nothing;
$$;

revoke all on function public.grant_attended_badges_for_event(uuid) from public;
grant execute on function public.grant_attended_badges_for_event(uuid) to authenticated, service_role;
