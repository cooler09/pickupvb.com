-- ============================================================================
-- Fix: host_paid_event_count_30d references the dropped events.price_cents
-- column, so the free-tier "1 paid event / 30 days" cap is silently disabled.
--
-- Context: the RPC was created in 20260517000000_pro_subscriptions.sql reading
-- `events.price_cents`. Phase 9d (20260605000500_phase_9d_drop_legacy_events_
-- cols.sql) then DROPped `events.price_cents` when pricing moved onto
-- `event_divisions` (ADR 0006). Postgres does not track column dependencies for
-- `language sql` function bodies, so the drop succeeded and the function was
-- left referencing a column that no longer exists. At call time it raises
-- "column events.price_cents does not exist"; the caller
-- (SupabaseHostSubscriptionRepository.paidEventCount30d) swallows the error with
-- `if (error) return 0`, so `validateHostPaidEventCap` always sees a count of 0
-- and never blocks. Surfaced while writing the Rachel (P17 lapsed-Pro) persona
-- e2e for the rolling-30d cap.
--
-- Impact: re-enables the cap by counting paid events via the current pricing
-- column (`event_divisions.price_cents > 0`). An event counts when ANY of its
-- divisions is paid (one row per event via `distinct e.id`). The count stays
-- status-agnostic — a canceled paid event still occupies the slot (the abuse
-- guard: cancelling a paid event must not free a free-tier slot). Signature is
-- unchanged, so no app-layer or type changes are needed. Behavioural change:
-- free hosts who were creating unlimited paid events while the cap was broken
-- will again be capped at 1 / 30 days (the documented, intended behaviour).
-- ============================================================================

create or replace function public.host_paid_event_count_30d(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct e.id)::int
    from public.events e
    join public.event_divisions d on d.event_id = e.id
   where e.host_id = p_user_id
     and d.price_cents > 0
     and e.created_at >= now() - interval '30 days'
$$;

grant execute on function public.host_paid_event_count_30d(uuid) to anon, authenticated;
