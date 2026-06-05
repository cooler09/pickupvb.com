-- ============================================================================
-- Bracket workflow redesign — `draft` lifecycle stage + per-match length.
-- See docs/adr/0032-bracket-workflow-redesign.md (extends ADR 0018).
--
-- Context: the bracket aggregate moves from a frozen generated graph to an
-- editable one. `generate()` now lands a bracket in a new `draft` status
-- (fully editable) before `publish()` flips it to `active` (live scoring).
-- Hosts can also set best-of / target-score per stage and override either on
-- a single match — the per-match overrides are the only new fields that don't
-- fit the existing `event_brackets.config` jsonb, so they become columns.
--
-- Impact:
--   * event_brackets.status CHECK widens to allow 'draft'. Existing rows
--     (setup/active/completed) are untouched and still valid.
--   * bracket_matches gains nullable best_of / target_score. NULL = "fall back
--     to the stage / bracket default" — every existing row reads as NULL, so
--     pre-redesign brackets behave exactly as before.
--   * save_bracket() (the atomic full-replace RPC) is updated to round-trip the
--     two new match columns. Additive: callers passing matches without the keys
--     get NULLs (jsonb ->> of a missing key is NULL).
-- ============================================================================

-- 1. Widen the bracket status CHECK to include 'draft'. The constraint was
--    created inline on the original `tournament_brackets` table and Postgres
--    does NOT rename CHECK constraints when a table is renamed, so the live
--    name is still `tournament_brackets_status_check`. Drop both possible
--    names if-exists for environment robustness, then re-add under the
--    current table name.
alter table public.event_brackets
  drop constraint if exists tournament_brackets_status_check;
alter table public.event_brackets
  drop constraint if exists event_brackets_status_check;
alter table public.event_brackets
  add constraint event_brackets_status_check
  check (status in ('setup', 'draft', 'active', 'completed'));

-- 2. Per-match length overrides. Nullable: NULL means "use the stage / bracket
--    default" resolved in the domain (Match.bestOf ?? stage ?? config.bestOf).
alter table public.bracket_matches
  add column if not exists best_of      int,
  add column if not exists target_score int;

-- 3. Re-create save_bracket to round-trip best_of / target_score. Body is
--    identical to 20260813000100_save_bracket_rpc.sql except the match INSERT
--    now reads the two new keys. SECURITY INVOKER posture preserved.
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
    court, slot, best_of, target_score, status, scheduled_at,
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
    (m->>'best_of')::int,
    (m->>'target_score')::int,
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
