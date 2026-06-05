-- ============================================================================
-- Fix save_bracket() header upsert tripping event_brackets_scope_xor for
-- standalone (owner-scoped) brackets. See docs/adr/0025-standalone-brackets.md
-- and docs/adr/0032-bracket-workflow-redesign.md.
--
-- Context: standalone brackets (ADR 0025) are owner-scoped — `owner_user_id`
-- set, `division_id` NULL — guarded by the `event_brackets_scope_xor` CHECK
-- (exactly one of division_id / owner_user_id). `save_bracket` has no owner
-- parameter, so the repository (SupabaseBracketRepository.save) pre-upserts the
-- owner-scoped header first, expecting save_bracket's own header write to land
-- on the existing row and leave the scope columns untouched.
--
-- That assumption was broken by the 20260908000000 rewrite, which writes the
-- header as `INSERT ... ON CONFLICT (id) DO UPDATE`. Postgres evaluates table
-- CHECK constraints on the *proposed insert tuple* before the ON CONFLICT
-- arbiter routes to DO UPDATE — and that tuple carries `owner_user_id` = NULL
-- (the column isn't in the INSERT list) together with `division_id` = NULL for
-- a standalone bracket, so the XOR check fails and the whole save aborts with
-- "new row for relation \"event_brackets\" violates check constraint
-- \"event_brackets_scope_xor\"". Net effect: every standalone bracket
-- create / seed / generate / record 500s. Event-scoped brackets were never
-- affected (their proposed-insert tuple has a non-NULL division_id).
--
-- Impact: re-creates `save_bracket` with the header step rewritten as an
-- `UPDATE ...; IF NOT FOUND THEN INSERT` so no proposed-insert tuple with a
-- NULL owner is ever evaluated against the XOR check:
--   * standalone save: the pre-upserted owner-scoped row exists → UPDATE branch
--     runs and never touches owner_user_id (XOR stays satisfied).
--   * event-scoped first save: no row yet → INSERT branch with a non-NULL
--     division_id (XOR satisfied).
--   * any re-save: UPDATE branch.
-- Signature, SECURITY INVOKER posture, grants, and steps 2–4 (seeds / matches /
-- match-sets) are byte-for-byte identical to 20260908000000 — only the header
-- write changes. No app-layer or type changes (the RPC signature is unchanged).
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
  -- 1. Upsert bracket header WITHOUT an ON CONFLICT insert — UPDATE-first so a
  --    NULL-owner / NULL-division proposed insert tuple is never formed for a
  --    standalone bracket (its owner-scoped header is pre-upserted by the repo).
  --    The INSERT branch only runs for a brand-new event-scoped bracket, whose
  --    division_id is non-NULL, so the scope XOR is always satisfied.
  update public.event_brackets
     set division_id = p_division_id,
         format      = p_format,
         config      = p_config,
         status      = p_status,
         updated_at  = now()
   where id = p_bracket_id;

  if not found then
    insert into public.event_brackets
      (id, division_id, format, config, status, updated_at)
    values
      (p_bracket_id, p_division_id, p_format, p_config, p_status, now());
  end if;

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
