-- ============================================================================
-- record_league_match_result RPC — narrow, RLS-enforced score entry for a
-- single league schedule match. See docs/audits/event-data-model.md — closes
-- the carry-forward "captain-RLS gap on league match-result writes".
--
-- Context: `RecordLeagueMatchResultHandler` persisted captain-entered scores
-- through `save_league_schedule` (a full delete-all + reinsert of the
-- division's slate) executed with the service-role admin client. That client
-- bypasses RLS, so the `league_schedule_matches_update` policy (host OR
-- either team's captain) was never enforced — ANY signed-in user could
-- overwrite ANY league match's score. The full-replace shape also can't be
-- run under RLS by a captain (they hold UPDATE on their match rows, not the
-- DELETE/INSERT the full replace needs). This RPC gives the captain path a
-- single-row UPDATE that the existing RLS policy gates, invoked from the
-- app through a *user-scoped* client (see SupabaseLeagueScheduleRepository).
--
-- Impact: additive RPC. SECURITY INVOKER, so the caller's RLS applies: the
-- UPDATE only touches the row if `is_event_host_for_division(division_id)` or
-- `is_league_match_captain(id)` passes (migration 20260803000000). When the
-- caller is neither, RLS filters the row out and zero rows update — the
-- function distinguishes "not found" (no row visible via the public SELECT
-- policy) from "not authorized" (row exists but the UPDATE matched nothing)
-- and raises the matching SQLSTATE so the adapter can map to NotFoundError /
-- UnauthorizedError. Only scores + status are writable here; match metadata
-- (week, teams, schedule) stays on the host-only `save_league_schedule` path.
-- ============================================================================

create or replace function public.record_league_match_result(
  p_match_id   uuid,
  p_home_score int,
  p_away_score int,
  p_status     text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
begin
  update public.league_schedule_matches
     set home_score = p_home_score,
         away_score = p_away_score,
         status     = p_status
   where id = p_match_id;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    -- The public SELECT policy (`using (true)`) lets every caller see the
    -- row, so visibility here means the UPDATE's RLS check is what failed.
    if exists (select 1 from public.league_schedule_matches where id = p_match_id) then
      raise exception 'not authorized to record this league match result'
        using errcode = '42501'; -- insufficient_privilege
    else
      raise exception 'league schedule match % not found', p_match_id
        using errcode = 'P0002'; -- no_data_found
    end if;
  end if;
end;
$$;

grant execute on function public.record_league_match_result(uuid, int, int, text)
  to authenticated;
