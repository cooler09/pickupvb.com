-- Perf: indexes for hot lookups that previously triggered seq scans as data grows.
--
-- 1. events.host_id           — used by /players/[id], /profile, hosted-event loaders.
-- 2. team_members.user_id     — used by /profile (pending invites), /teams discover
--                                (rostered + captained sections, invite acceptance).
-- 3. teams.captain_id         — used by /teams discover ("captained by you") and the
--                                captain:profiles join in the teams list.
-- 4. profiles.home_city       — used by /players city filter and home-city lookups.

create index if not exists events_host_idx        on public.events (host_id);
create index if not exists team_members_user_idx  on public.team_members (user_id);
create index if not exists teams_captain_idx      on public.teams (captain_id);
create index if not exists profiles_home_city_idx on public.profiles (home_city);
