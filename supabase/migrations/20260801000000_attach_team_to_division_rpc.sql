-- ============================================================================
-- attach_team_to_division RPC — atomic roster classification.
--
-- Context: Step 5b collapsed event_teams + event_team_registrations into
-- event_team_entries, guarded by a partial unique index
-- `event_team_entries_division_team_uidx ON (division_id, team_id)
-- WHERE team_id IS NOT NULL AND deleted_at IS NULL`. PostgREST upserts
-- can't target partial unique indexes (Postgres requires the index
-- predicate to be inferred from the ON CONFLICT clause, which the JSON
-- API doesn't supply), so the infrastructure repo had to do a
-- select-then-insert dance for idempotence.
--
-- Impact: adds a single SECURITY INVOKER RPC that performs the
-- INSERT … ON CONFLICT DO NOTHING in one statement, naming the partial
-- index's columns + predicate so Postgres infers the right index. RLS
-- still applies via SECURITY INVOKER, so the caller must satisfy the
-- existing `event_team_entries_insert` policy (captain attaching their
-- own roster team). No schema reshape; no data backfill.
-- ============================================================================

create or replace function public.attach_team_to_division(
  p_division_id uuid,
  p_team_id uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_captain_id uuid;
  v_name       text;
begin
  select t.captain_id, t.name
    into v_captain_id, v_name
    from public.teams t
   where t.id = p_team_id;

  if v_captain_id is null then
    raise exception 'team % not found', p_team_id
      using errcode = 'P0002';
  end if;

  insert into public.event_team_entries
    (division_id, source, team_id, captain_id, display_name)
  values
    (p_division_id, 'roster', p_team_id, v_captain_id, v_name)
  on conflict (division_id, team_id)
    where team_id is not null and deleted_at is null
    do nothing;
end;
$$;

grant execute on function public.attach_team_to_division(uuid, uuid) to authenticated;
