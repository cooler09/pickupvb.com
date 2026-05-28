-- ============================================================================
-- Drop event_attendees / event_free_agents bridge views + INSTEAD OF triggers
-- (Bundle B of the bridge-view caller retargeting follow-up tracked in
-- docs/audits/event-data-model.md, P2 #6.7).
--
-- Context: migration 20260802000000_collapse_attendees_free_agents.sql
-- collapsed both tables into canonical event_participants +
-- event_participant_payments and recreated the dropped tables as
-- SECURITY INVOKER views over them, with INSTEAD OF INSERT/UPDATE/DELETE
-- triggers, so existing `.from('event_attendees')` / `.from('event_free_agents')`
-- callers kept working unchanged. Bundle A of this follow-up (no
-- migration, code only) retargeted every caller -- app routes, server
-- actions, infra repo, realtime hook -- onto the canonical tables. After
-- Bundle A's verify chain went green, nothing in the codebase still
-- references the bridge views.
--
-- Impact: removes the views + their six INSTEAD OF trigger functions.
-- Drops the `event_attendees` / `event_free_agents` table entries from
-- the generated Supabase types after `pnpm --filter @pickupvb/supabase
-- gen:types`. RLS posture and capacity enforcement are unchanged --
-- they live on event_participants directly. No data movement -- the
-- canonical tables hold the data; the views were a pass-through.
-- Realtime publication already covers event_participants (the views
-- could never participate). Anyone reaching for the dropped name after
-- this migration gets a clear "relation does not exist" error rather
-- than silent divergence.
-- ============================================================================

-- ---- 1. Drop INSTEAD OF triggers -------------------------------------------
-- Triggers are owned by the views, so `drop view ... cascade` would handle
-- them, but dropping them explicitly makes the intent obvious in the diff.

drop trigger if exists event_attendees_bridge_insert_trg  on public.event_attendees;
drop trigger if exists event_attendees_bridge_update_trg  on public.event_attendees;
drop trigger if exists event_attendees_bridge_delete_trg  on public.event_attendees;

drop trigger if exists event_free_agents_bridge_insert_trg on public.event_free_agents;
drop trigger if exists event_free_agents_bridge_update_trg on public.event_free_agents;
drop trigger if exists event_free_agents_bridge_delete_trg on public.event_free_agents;

-- ---- 2. Drop the views -----------------------------------------------------

drop view if exists public.event_attendees;
drop view if exists public.event_free_agents;

-- ---- 3. Drop the bridge trigger functions ----------------------------------

drop function if exists public.event_attendees_bridge_insert();
drop function if exists public.event_attendees_bridge_update();
drop function if exists public.event_attendees_bridge_delete();

drop function if exists public.event_free_agents_bridge_insert();
drop function if exists public.event_free_agents_bridge_update();
drop function if exists public.event_free_agents_bridge_delete();
