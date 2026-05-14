-- ============================================================================
-- Fix: infinite recursion between events_select and event_co_hosts_select.
--
-- events_select did: `exists (select 1 from event_co_hosts ch ...)`
-- event_co_hosts_select did: `exists (select 1 from events e ...)`
--
-- An UPDATE on events triggers events_select on the row, which fans out into
-- event_co_hosts, whose policy queries events — cycle, Postgres aborts with
-- "infinite recursion detected in policy for relation events".
--
-- The (event_id, host_user_id|host_group_id) link itself is not sensitive —
-- if you can already see the event, you'll see its co-host pills; if you
-- can't, you don't have the event id. Make the select policy permissive and
-- keep insert/delete gated by event-management rights.
-- ============================================================================

drop policy if exists event_co_hosts_select on public.event_co_hosts;

create policy event_co_hosts_select on public.event_co_hosts
  for select using (true);
