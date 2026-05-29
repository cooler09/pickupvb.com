-- ============================================================================
-- save_league_schedule RPC — atomic full-replace of a league division's
-- match slate. See docs/audits/event-data-model.md § P1 #2 follow-up
-- "LeagueSchedule RPC (consumer of the forfeit flag)".
--
-- Context: SupabaseLeagueScheduleRepository.save mirrors the bracket
-- adapter — it owns the entire match list and persists with a
-- delete-all + reinsert pair. Those two statements ran as independent
-- PostgREST calls, so a transient failure between them could leave the
-- division with a partial (or empty) slate. The bracket adapter has
-- the same shape; this RPC fixes the league side first because the
-- league schedule is the higher-write surface (hosts edit weekly
-- scoreboards every match night).
--
-- Impact: additive RPC. The function takes the destination division id
-- plus a JSON array of match rows; it deletes every existing match for
-- the division and reinserts from the array in a single SQL function
-- body, which PostgREST wraps in one transaction. The function is
-- SECURITY INVOKER so RLS still applies to callers without the
-- service-role key (the production adapter uses the admin client and
-- bypasses RLS, but the INVOKER posture leaves a real RLS check in
-- place for any future user-scoped callers).
--
-- JSON shape per element (mirrors `league_schedule_matches` columns):
--   { id, week_number, scheduled_at, court_label, home_team_id,
--     away_team_id, home_score, away_score, status, notes }
-- Missing or JSON-null values cast cleanly to SQL null for every
-- nullable column.
-- ============================================================================

create or replace function public.save_league_schedule(
  p_division_id uuid,
  p_matches     jsonb
) returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.league_schedule_matches
   where division_id = p_division_id;

  insert into public.league_schedule_matches (
    id, division_id, week_number, scheduled_at, court_label,
    home_team_id, away_team_id, home_score, away_score, status, notes
  )
  select
    (m->>'id')::uuid,
    p_division_id,
    (m->>'week_number')::int,
    (m->>'scheduled_at')::timestamptz,
    m->>'court_label',
    (m->>'home_team_id')::uuid,
    (m->>'away_team_id')::uuid,
    (m->>'home_score')::int,
    (m->>'away_score')::int,
    coalesce(m->>'status', 'scheduled'),
    m->>'notes'
  from jsonb_array_elements(p_matches) as m;
$$;

grant execute on function public.save_league_schedule(uuid, jsonb) to authenticated, service_role;
