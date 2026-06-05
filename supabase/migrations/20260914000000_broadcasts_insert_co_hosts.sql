-- ============================================================================
-- Broadcasts: let event co-hosts send attendee broadcasts, not just the host.
--
-- Context: `broadcasts_insert_event_host` (20260524000000_notifications.sql)
-- gated `event_attendees` broadcasts on `events.host_id = auth.uid()` — the
-- literal primary host only. But co-hosts reach `/events/[id]/manage` (the
-- manage page authorizes the same set the `events_select` policy + `canManage`
-- grant) and the `HostBroadcastPanel` renders there, so a co-host could compose
-- a broadcast and hit send — only for the user-session INSERT to be rejected by
-- this policy. The UI offered an action the policy forbade. Surfaced by the
-- Steve (P3, co-host) persona e2e.
--
-- Impact: the insert check now delegates to `public.is_event_host(audience_id)`
-- — the same SECURITY DEFINER manager predicate the bracket / league
-- match-result RPCs already use (host OR `event_co_hosts.host_user_id` OR an
-- admin of a co-host group). Behavioural change: event co-hosts can now message
-- all attendees of a co-hosted event, matching their manage access. Payout /
-- ownership are unaffected (broadcasts carry no money). `group_members`
-- broadcasts (`broadcasts_insert_group_admin`) are untouched.
-- ============================================================================

drop policy if exists broadcasts_insert_event_host on public.broadcasts;

create policy broadcasts_insert_event_host
  on public.broadcasts for insert
  with check (
    audience_type = 'event_attendees'
    and public.is_event_host(audience_id)
  );
