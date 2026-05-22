-- Adds optional "division winner" fields so hosts can record the
-- winning team of each division after play wraps up. A division may be
-- won by either a roster-mode team (`event_teams.team_id` -> `teams.id`)
-- or an ad-hoc registration (`event_team_registrations.id`); at most one
-- of the two FKs is populated at a time. `winner_recorded_at` captures
-- when the host marked the result.

alter table public.event_divisions
  add column winner_team_id              uuid references public.teams(id) on delete set null,
  add column winner_team_registration_id uuid references public.event_team_registrations(id) on delete set null,
  add column winner_recorded_at          timestamptz;

alter table public.event_divisions
  add constraint event_divisions_winner_exclusive check (
    winner_team_id is null or winner_team_registration_id is null
  );

alter table public.event_divisions
  add constraint event_divisions_winner_timestamp check (
    (winner_team_id is null and winner_team_registration_id is null) = (winner_recorded_at is null)
  );

create index event_divisions_winner_team_idx
  on public.event_divisions (winner_team_id)
  where winner_team_id is not null;

create index event_divisions_winner_registration_idx
  on public.event_divisions (winner_team_registration_id)
  where winner_team_registration_id is not null;
