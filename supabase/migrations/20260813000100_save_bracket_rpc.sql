-- ============================================================================
-- save_bracket RPC — atomic full-replace of a bracket's header, seeds,
-- matches, and match sets. See docs/audits/event-data-model.md — closes
-- the parallel partial-state follow-up. Sibling to
-- 20260812000000_save_league_schedule_rpc.sql.
--
-- Context: SupabaseBracketRepository.save persists the full aggregate
-- via a sequence of independent PostgREST calls:
--   1. UPSERT event_brackets (header)
--   2. DELETE bracket_seeds where bracket_id = X
--   3. INSERT new bracket_seeds
--   4. DELETE bracket_matches where bracket_id = X
--   5. INSERT new bracket_matches WITHOUT advances_to_* wiring
--   6. UPDATE each wired match to set advances_to_* (forward-FK pass)
--   7. INSERT bracket_match_sets
-- Any transient failure between (2) and (7) leaves the bracket in a
-- partial / inconsistent state. The league-schedule RPC fixed the same
-- shape on `league_schedule_matches`; this RPC does the same for the
-- bracket aggregate.
--
-- Single-statement match INSERT replaces the two-pass wiring update:
-- `advances_to_match_id` is a self-FK on `bracket_matches`, and Postgres
-- checks FK constraints at statement boundary, so an INSERT … SELECT
-- that brings every match in atomically satisfies all forward references
-- between the new rows. `bracket_match_sets.match_id` cascades on
-- bracket_matches delete, so the prior DELETE on bracket_matches
-- removes the existing sets — no separate clear is needed.
--
-- Impact: additive RPC. SECURITY INVOKER matches the
-- `save_league_schedule` precedent — the production adapter uses the
-- admin client and bypasses RLS, but the INVOKER posture keeps the
-- existing host / captain RLS policies in force for any future
-- user-scoped caller.
-- ============================================================================

create or replace function public.save_bracket(
  p_bracket_id  uuid,
  p_division_id uuid,
  p_format      text,
  p_config      jsonb,
  p_status      text,
  p_seeds       jsonb,
  p_matches     jsonb,
  p_match_sets  jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- 1. Upsert bracket header.
  insert into public.event_brackets
    (id, division_id, format, config, status, updated_at)
  values
    (p_bracket_id, p_division_id, p_format, p_config, p_status, now())
  on conflict (id) do update
    set division_id = excluded.division_id,
        format      = excluded.format,
        config      = excluded.config,
        status      = excluded.status,
        updated_at  = excluded.updated_at;

  -- 2. Reconcile seeds.
  delete from public.bracket_seeds where bracket_id = p_bracket_id;
  insert into public.bracket_seeds (bracket_id, entry_id, seed, pool)
  select
    p_bracket_id,
    (s->>'entry_id')::uuid,
    (s->>'seed')::int,
    s->>'pool'
  from jsonb_array_elements(p_seeds) as s;

  -- 3. Reconcile matches (wiring included; self-FK resolves at statement
  --    boundary). bracket_match_sets cascade-delete with the matches.
  delete from public.bracket_matches where bracket_id = p_bracket_id;
  insert into public.bracket_matches (
    id, bracket_id, round, match_number, pool, bracket_side,
    entry_a_id, entry_b_id, winner_entry_id, work_entry_id,
    court, slot, status, scheduled_at,
    advances_to_match_id, advances_to_slot,
    loser_advances_to_match_id, loser_advances_to_slot,
    updated_at
  )
  select
    (m->>'id')::uuid,
    p_bracket_id,
    (m->>'round')::int,
    (m->>'match_number')::int,
    m->>'pool',
    m->>'bracket_side',
    (m->>'entry_a_id')::uuid,
    (m->>'entry_b_id')::uuid,
    (m->>'winner_entry_id')::uuid,
    (m->>'work_entry_id')::uuid,
    m->>'court',
    (m->>'slot')::int,
    m->>'status',
    (m->>'scheduled_at')::timestamptz,
    (m->>'advances_to_match_id')::uuid,
    m->>'advances_to_slot',
    (m->>'loser_advances_to_match_id')::uuid,
    m->>'loser_advances_to_slot',
    now()
  from jsonb_array_elements(p_matches) as m;

  -- 4. Insert match sets.
  insert into public.bracket_match_sets (
    match_id, set_number, team_a_score, team_b_score
  )
  select
    (s->>'match_id')::uuid,
    (s->>'set_number')::int,
    (s->>'team_a_score')::int,
    (s->>'team_b_score')::int
  from jsonb_array_elements(p_match_sets) as s;
end;
$$;

grant execute on function public.save_bracket(
  uuid, uuid, text, jsonb, text, jsonb, jsonb, jsonb
) to authenticated, service_role;
