-- Allow broadcasts targeting team rosters. Adds 'team_members' to the
-- audience_type check constraint + an RLS policy for team captains.

alter table public.broadcasts
  drop constraint if exists broadcasts_audience_type_check;

alter table public.broadcasts
  add constraint broadcasts_audience_type_check
  check (audience_type in ('event_attendees','group_members','team_members'));

-- Team captains can broadcast to their team. Captain is identified by
-- `teams.captain_id`.
create policy broadcasts_insert_team_captain
  on public.broadcasts for insert
  with check (
    audience_type = 'team_members'
    and exists (
      select 1 from public.teams t
      where t.id = audience_id
        and t.captain_id = auth.uid()
    )
  );
