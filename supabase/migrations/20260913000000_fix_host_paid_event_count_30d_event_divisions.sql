-- ============================================================================
-- Repo fix: host_paid_event_count_30d references the dropped events.price_cents,
-- so a fresh DB built from these migrations gets a paid-event cap that never
-- fires. Re-point it at the current pricing column (event_divisions.price_cents).
--
-- Context: the RPC was created in 20260517000000_pro_subscriptions.sql reading
-- `events.price_cents`. Phase 9d (20260605000500_phase_9d_drop_legacy_events_
-- cols.sql) then DROPped `events.price_cents` when pricing moved onto
-- `event_divisions` (ADR 0006). Postgres does not track column dependencies for
-- `language sql` function bodies, so a fresh apply leaves the function
-- referencing a column that no longer exists → it raises "column
-- events.price_cents does not exist" at call time, and the caller
-- (SupabaseHostSubscriptionRepository.paidEventCount30d) swallows it with
-- `if (error) return 0` → `validateHostPaidEventCap` always passes.
--
-- NOTE (verified against dev 2026-06-04): the DEPLOYED cap on dev actually
-- WORKS — the RPC there returns counts cleanly (no error) and the cap fires —
-- even though `events.price_cents` 404s. So dev carries an UNTRACKED hotfix to
-- this RPC that never landed as a migration (a repo/dev drift). This migration
-- brings an equivalent fix into the tracked history so a fresh DB matches dev.
-- It is therefore a repo-correctness fix, NOT a live behavioural change on dev
-- (the cap already enforces there). Verify the deployed RPC source before
-- assuming this body matches it exactly. Surfaced while writing the Rachel
-- (P17 lapsed-Pro) cap e2e + running the suite against dev.
--
-- Impact: counts paid events via `event_divisions.price_cents > 0`; an event
-- counts when ANY of its divisions is paid (one row per event via
-- `distinct e.id`). Status-agnostic — a canceled paid event still occupies the
-- slot (the abuse guard). Signature unchanged → no app-layer / type changes.
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
