-- ============================================================================
-- record_bracket_match_result RPC — authorized full-replace persist for the
-- captain-reachable bracket writes (record a match's result; clear/reset a
-- match). See docs/audits/event-data-model.md — closes the bracket half of
-- the "captain-RLS gap on match-result writes". Sibling to
-- 20260814000000_record_league_match_result_rpc.sql.
--
-- Context: `RecordMatchResultHandler` / `ResetMatchHandler` persisted through
-- `save_bracket` on the service-role admin client, which bypasses RLS — so
-- the `bracket_matches_update` / `bracket_match_sets_write` captain policies
-- never fired and ANY signed-in user could record ANY match.
--
-- Why this can't be a narrow SECURITY INVOKER UPDATE like the league RPC:
-- recording a bracket result is not a single-row write. The domain advances
-- the winner into the *downstream* match's slot (a row the captain neither
-- hosts nor captains — its teams are still TBD) and may flip the
-- `event_brackets` header to 'completed' (a host-only row). A captain has no
-- RLS grant on either, so a pure-INVOKER replay of the domain-computed state
-- would be rejected mid-write. The advancement / completion logic lives in
-- the tested TS aggregate (`Bracket.recordResult`), and reimplementing it in
-- SQL would duplicate and risk drifting from it.
--
-- Approach: SECURITY DEFINER with an explicit per-match authorization gate.
-- The function resolves the event behind the *actor* match (the one the
-- caller claims to be scoring) and requires `is_event_host(event)` OR
-- `is_bracket_match_captain(actor_match)` — i.e. exactly the same predicate
-- the RLS policies encode, evaluated against `auth.uid()` (which is the end
-- user even inside a DEFINER body — it reads the request JWT GUC, not the
-- current role). Once authorized it delegates the write to `save_bracket`.
--
-- `save_bracket` is SECURITY INVOKER; called from inside this SECURITY
-- DEFINER function it executes as THIS function's owner (a BYPASSRLS role),
-- so the downstream-advancement / header-completion writes land after the
-- per-match authorization above. This is safe because the bracket payload is
-- always computed by the trusted application/domain layer from the persisted
-- bracket plus the actor's (matchId, sets) input — the caller controls only
-- which match they score, never the resulting bracket shape. The two
-- functions must evolve together: a signature change to `save_bracket` must
-- update the `perform` call below.
-- ============================================================================

create or replace function public.record_bracket_match_result(
  p_actor_match_id uuid,
  p_bracket_id     uuid,
  p_division_id    uuid,
  p_format         text,
  p_config         jsonb,
  p_status         text,
  p_seeds          jsonb,
  p_matches        jsonb,
  p_match_sets     jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  -- Resolve the event behind the actor match for the host check.
  select d.event_id
    into v_event_id
    from public.bracket_matches bm
    join public.event_brackets eb on eb.id = bm.bracket_id
    join public.event_divisions d on d.id = eb.division_id
   where bm.id = p_actor_match_id;

  if v_event_id is null then
    raise exception 'bracket match % not found', p_actor_match_id
      using errcode = 'P0002'; -- no_data_found
  end if;

  -- Same predicate the bracket_matches / bracket_match_sets RLS policies use.
  if not (
    public.is_event_host(v_event_id)
    or public.is_bracket_match_captain(p_actor_match_id)
  ) then
    raise exception 'not authorized to record this bracket match result'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  -- Delegate the actual full-replace to the shared save function. See the
  -- header note on the INVOKER-inside-DEFINER role semantics.
  perform public.save_bracket(
    p_bracket_id, p_division_id, p_format, p_config, p_status,
    p_seeds, p_matches, p_match_sets
  );
end;
$$;

grant execute on function public.record_bracket_match_result(
  uuid, uuid, uuid, text, jsonb, text, jsonb, jsonb, jsonb
) to authenticated;
