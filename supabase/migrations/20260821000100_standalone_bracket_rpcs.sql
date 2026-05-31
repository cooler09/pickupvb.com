-- ============================================================================
-- ADR 0025: owner-aware bracket RPCs for standalone (event-free) brackets.
-- See docs/adr/0025-standalone-brackets.md
--
-- Context: 20260821000000_standalone_brackets.sql added owner_user_id +
-- nullable division_id to event_brackets. The two bracket-persistence RPCs
-- still assume an event-scoped bracket:
--   * save_bracket's on-conflict update rewrites division_id from the (now
--     possibly NULL) argument — for a standalone re-save this is a no-op, but
--     making scope create-only is more robust and prevents any future caller
--     from flipping a bracket's scope through the save path.
--   * record_bracket_match_result resolves the event behind the actor match
--     via an INNER join on event_divisions; for a standalone bracket that join
--     yields no row, so v_event_id is NULL and the function raises P0002 even
--     for the legitimate owner.
--
-- Impact: both are `create or replace` with UNCHANGED signatures, so callers
-- (SupabaseBracketRepository.buildSaveArgs, the perform-call below) are
-- byte-stable. save_bracket drops division_id from its conflict-update SET
-- list (scope columns become create-only). record_bracket_match_result LEFT
-- joins event_divisions, captures owner_user_id, and admits the write when the
-- caller is the event host / a match captain (event brackets) OR the bracket
-- owner (standalone). is_bracket_match_captain is unchanged.
-- ============================================================================

-- ---- 1. save_bracket: make scope (division_id) create-only ----------------
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
  -- 1. Upsert bracket header. division_id is set ONLY on insert (create-only);
  --    the conflict path leaves scope (division_id / owner_user_id) untouched
  --    so a standalone re-save can't NULL its owner scope and an event bracket
  --    keeps its division. Standalone headers are created by the repository's
  --    direct insert (it writes owner_user_id, which this RPC does not), so the
  --    insert below only fires for event brackets; for standalone the row
  --    already exists and the conflict path runs.
  insert into public.event_brackets
    (id, division_id, format, config, status, updated_at)
  values
    (p_bracket_id, p_division_id, p_format, p_config, p_status, now())
  on conflict (id) do update
    set format     = excluded.format,
        config     = excluded.config,
        status     = excluded.status,
        updated_at = excluded.updated_at;

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

-- ---- 2. record_bracket_match_result: admit the standalone owner -----------
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
  v_owner_id uuid;
begin
  -- Resolve the actor match's bracket scope. LEFT join event_divisions so a
  -- standalone bracket (division_id NULL) still resolves the row; v_event_id
  -- is then NULL and v_owner_id carries the owner.
  select eb.owner_user_id, d.event_id
    into v_owner_id, v_event_id
    from public.bracket_matches bm
    join public.event_brackets eb on eb.id = bm.bracket_id
    left join public.event_divisions d on d.id = eb.division_id
   where bm.id = p_actor_match_id;

  if not found then
    raise exception 'bracket match % not found', p_actor_match_id
      using errcode = 'P0002'; -- no_data_found
  end if;

  -- Event brackets: host or match captain. Standalone brackets: the owner.
  if not (
    (v_event_id is not null
      and (public.is_event_host(v_event_id) or public.is_bracket_match_captain(p_actor_match_id)))
    or (v_owner_id is not null and v_owner_id = auth.uid())
  ) then
    raise exception 'not authorized to record this bracket match result'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  -- Delegate the actual full-replace to the shared save function. See the
  -- 20260814000100 header note on the INVOKER-inside-DEFINER role semantics.
  perform public.save_bracket(
    p_bracket_id, p_division_id, p_format, p_config, p_status,
    p_seeds, p_matches, p_match_sets
  );
end;
$$;

grant execute on function public.record_bracket_match_result(
  uuid, uuid, uuid, text, jsonb, text, jsonb, jsonb, jsonb
) to authenticated;
