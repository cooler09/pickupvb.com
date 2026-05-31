-- ============================================================================
-- Notification broadcast — per-user Realtime Broadcast for the in-app bell.
-- See docs/adr/0027-realtime-broadcast-notifications.md
--
-- Context: the site-header notification bell subscribed to `public.notifications`
-- over Realtime `postgres_changes` filtered by user_id — one concurrent
-- connection per logged-in tab, on the path Supabase documents as non-scaling
-- (per-subscriber RLS re-evaluation on a single replication stream). Worse,
-- `public.notifications` was never added to the `supabase_realtime` publication
-- by any migration, so the postgres_changes path is effectively inert in a
-- migration-provisioned database. This moves in-app delivery to Realtime
-- **Broadcast from the database**: an AFTER INSERT trigger emits the new row to a
-- per-user private topic `notifications:{user_id}` (ADR 0026 already treats the
-- in-app channel as Realtime-delivered; this makes that actually true + scalable).
--
-- Impact: adds `public.broadcast_notification()` (SECURITY DEFINER) + an AFTER
-- INSERT trigger on `public.notifications`, and a SELECT policy on
-- `realtime.messages` authorizing each authenticated user to receive ONLY their
-- own topic. No public-table schema change (no `gen:types` needed). Public
-- Realtime channels (scoreboard `scoreboard:{code}`, the `live-scores:*` channels)
-- are unaffected — `realtime.messages` RLS only gates `private` channels. The
-- client ([notification-bell.tsx]) switches to a private Broadcast channel in the
-- same PR; the old postgres_changes path is removed. Requires a Realtime version
-- providing `realtime.broadcast_changes` (Supabase platform default).
-- ============================================================================

-- Emit each new notification to its recipient's private Broadcast topic.
-- SECURITY DEFINER so the insert into realtime.messages isn't blocked by RLS;
-- the receiving side is gated by the policy below. `set search_path = ''` per
-- the SECURITY DEFINER hardening convention — all refs are schema-qualified.
create or replace function public.broadcast_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'notifications:' || new.user_id::text,  -- topic: one per recipient
    tg_op,                                   -- event name  → 'INSERT'
    tg_op,                                   -- operation
    tg_table_name,                           -- 'notifications'
    tg_table_schema,                         -- 'public'
    new,                                     -- record (the new row)
    old                                      -- old_record (null on INSERT)
  );
  return null;
end;
$$;

drop trigger if exists broadcast_notification_after_insert on public.notifications;
create trigger broadcast_notification_after_insert
  after insert on public.notifications
  for each row
  execute function public.broadcast_notification();

-- Realtime Authorization: an authenticated user may receive Broadcast messages
-- only on THEIR own topic. This is the standard `realtime.messages` RLS gate for
-- private channels; without a matching policy a private subscribe is denied.
drop policy if exists "receive own notification broadcasts" on realtime.messages;
create policy "receive own notification broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'notifications:' || (select auth.uid())::text
  );
