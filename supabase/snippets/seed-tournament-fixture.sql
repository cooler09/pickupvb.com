-- ============================================================================
-- E2E Tournament Fixture — idempotent seed for tournament Playwright specs.
--
-- Context: apps/web/tests/e2e/tournament.authed.spec.ts currently skips
-- 14 fixmes + 2 environmental skips because no tournament event exists in
-- the local / dev DB. Section 4 of the "Unblocking skipped tests"
-- playbook (apps/web/tests/e2e/README.md) calls for a re-runnable
-- fixture that gives every tournament flow something to bite on.
--
-- This snippet creates (if missing):
--   * 1 published ad-hoc tournament hosted by the free-host test user
--     ("[E2E] Ad-Hoc Tournament Fixture", short code E2ETFA) with 2 divisions.
--   * 1 published roster-mode tournament hosted by the same user
--     ("[E2E] Roster Tournament Fixture") with 2 divisions, 4 persistent
--     teams (2 per division) captained by attendee-a / attendee-b /
--     free-host / pro-host, all registered into the event via
--     event_teams, plus a single-elimination bracket with seeds and the
--     round-1 matches wired up.
--
-- Idempotency: every INSERT is guarded with NOT EXISTS / ON CONFLICT,
-- keyed off stable titles + the deterministic short_code values
-- 'E2ETFA' (ad-hoc) and 'E2ETFR' (roster). Re-running the script is a
-- no-op once the fixture exists; deleting either event (cascades) and
-- re-running rebuilds it.
--
-- Apply locally:
--   supabase db reset            # if you want a fresh slate
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" \
--        -f supabase/snippets/seed-tournament-fixture.sql
--
-- Apply against dev / preview (requires SUPABASE_DB_URL pointing at the
-- target Postgres URL with a privileged role; this script bypasses RLS
-- by INSERTing as the script's connecting role):
--   psql "$SUPABASE_DB_URL" -f supabase/snippets/seed-tournament-fixture.sql
--
-- Prerequisites: the test accounts must already exist in auth.users:
--   zacharyjordan82+attendee-a@gmail.com
--   zacharyjordan82+attendee-b@gmail.com
--   zacharyjordan82+free-host@gmail.com
--   zacharyjordan82+pro-host@gmail.com
-- If any of those is missing the script raises and rolls back — sign in
-- once as each via the app to provision the auth.users + profiles rows,
-- then re-run.
-- ============================================================================

begin;

do $$
declare
  v_host_id      uuid;
  v_attendee_a   uuid;
  v_attendee_b   uuid;
  v_pro_host     uuid;
  v_event_adhoc  uuid;
  v_event_roster uuid;
  v_div_a        uuid;
  v_div_b        uuid;
  v_team_1       uuid;
  v_team_2       uuid;
  v_team_3       uuid;
  v_team_4       uuid;
  v_bracket_a    uuid;
  v_bracket_b    uuid;
  v_match_a_fin  uuid;
  v_match_b_fin  uuid;
  v_starts       timestamptz := now() + interval '30 days';
  v_ends         timestamptz := now() + interval '30 days 8 hours';
  v_geo          geography(point, 4326) := st_setsrid(st_makepoint(-77.4360, 37.5407), 4326)::geography;
begin
  -- ---- Resolve test users by email -----------------------------------------
  select id into v_host_id    from auth.users where email = 'zacharyjordan82+free-host@gmail.com';
  select id into v_attendee_a from auth.users where email = 'zacharyjordan82+attendee-a@gmail.com';
  select id into v_attendee_b from auth.users where email = 'zacharyjordan82+attendee-b@gmail.com';
  select id into v_pro_host   from auth.users where email = 'zacharyjordan82+pro-host@gmail.com';

  if v_host_id is null or v_attendee_a is null or v_attendee_b is null or v_pro_host is null then
    raise exception 'Missing test users in auth.users. Sign in as attendee-a, attendee-b, free-host, and pro-host first.';
  end if;

  -- ==========================================================================
  -- 1. AD-HOC TOURNAMENT
  -- ==========================================================================
  select id into v_event_adhoc from public.events where short_code = 'E2ETFA';

  if v_event_adhoc is null then
    insert into public.events (
      host_id, title, description, rules,
      surface, type, visibility, status,
      address_line, city, region, postal_code, country, geo,
      starts_at, ends_at,
      team_registration_mode, short_code, time_zone
    ) values (
      v_host_id,
      '[E2E] Ad-Hoc Tournament Fixture',
      'Seeded by supabase/snippets/seed-tournament-fixture.sql for Playwright tournament specs. Safe to delete.',
      '',
      'sand', 'tournament', 'public', 'published',
      '500 E Marshall St', 'Richmond', 'VA', '23219', 'US', v_geo,
      v_starts, v_ends,
      'ad_hoc', 'E2ETFA', 'America/New_York'
    )
    returning id into v_event_adhoc;
  end if;

  -- Ensure 2 divisions. The default-division trigger only ran for legacy
  -- rows; CreateEventHandler now emits one in app-layer code. For this
  -- raw SQL seed we explicitly add both divisions.
  if not exists (select 1 from public.event_divisions where event_id = v_event_adhoc and label = 'Men''s Open') then
    insert into public.event_divisions (
      event_id, sort_order, label,
      surface, format, gender,
      skill_tier, team_composition, team_size,
      capacity_kind, max_spots
    ) values (
      v_event_adhoc, 0, 'Men''s Open',
      'sand', 'doubles', 'mens',
      'open', 'team', 2,
      'fixed', 16
    );
  end if;

  if not exists (select 1 from public.event_divisions where event_id = v_event_adhoc and label = 'Women''s Open') then
    insert into public.event_divisions (
      event_id, sort_order, label,
      surface, format, gender,
      skill_tier, team_composition, team_size,
      capacity_kind, max_spots
    ) values (
      v_event_adhoc, 1, 'Women''s Open',
      'sand', 'doubles', 'womens',
      'open', 'team', 2,
      'fixed', 16
    );
  end if;

  -- ==========================================================================
  -- 2. ROSTER TOURNAMENT
  -- ==========================================================================
  select id into v_event_roster from public.events where short_code = 'E2ETFR';

  if v_event_roster is null then
    insert into public.events (
      host_id, title, description, rules,
      surface, type, visibility, status,
      address_line, city, region, postal_code, country, geo,
      starts_at, ends_at,
      team_registration_mode, short_code, time_zone
    ) values (
      v_host_id,
      '[E2E] Roster Tournament Fixture',
      'Seeded by supabase/snippets/seed-tournament-fixture.sql for Playwright tournament specs. Safe to delete.',
      '',
      'sand', 'tournament', 'public', 'published',
      '500 E Marshall St', 'Richmond', 'VA', '23219', 'US', v_geo,
      v_starts, v_ends,
      'roster', 'E2ETFR', 'America/New_York'
    )
    returning id into v_event_roster;
  end if;

  -- Resolve the two divisions (created either inline below or by a prior run).
  if not exists (select 1 from public.event_divisions where event_id = v_event_roster and label = 'A Division') then
    insert into public.event_divisions (
      event_id, sort_order, label,
      surface, format, gender,
      skill_tier, team_composition, team_size,
      capacity_kind, max_spots
    ) values (
      v_event_roster, 0, 'A Division',
      'sand', 'doubles', 'coed',
      'a', 'team', 2,
      'fixed', 8
    );
  end if;

  if not exists (select 1 from public.event_divisions where event_id = v_event_roster and label = 'BB Division') then
    insert into public.event_divisions (
      event_id, sort_order, label,
      surface, format, gender,
      skill_tier, team_composition, team_size,
      capacity_kind, max_spots
    ) values (
      v_event_roster, 1, 'BB Division',
      'sand', 'doubles', 'coed',
      'bb', 'team', 2,
      'fixed', 8
    );
  end if;

  select id into v_div_a from public.event_divisions where event_id = v_event_roster and label = 'A Division';
  select id into v_div_b from public.event_divisions where event_id = v_event_roster and label = 'BB Division';

  -- ---- Persistent teams (one per captain) ----------------------------------
  select t.id into v_team_1 from public.teams t
    where t.captain_id = v_attendee_a and t.name = '[E2E] Spikers' limit 1;
  if v_team_1 is null then
    insert into public.teams (captain_id, name, format) values (v_attendee_a, '[E2E] Spikers', 'doubles')
      returning id into v_team_1;
  end if;

  select t.id into v_team_2 from public.teams t
    where t.captain_id = v_attendee_b and t.name = '[E2E] Diggers' limit 1;
  if v_team_2 is null then
    insert into public.teams (captain_id, name, format) values (v_attendee_b, '[E2E] Diggers', 'doubles')
      returning id into v_team_2;
  end if;

  select t.id into v_team_3 from public.teams t
    where t.captain_id = v_host_id and t.name = '[E2E] Setters' limit 1;
  if v_team_3 is null then
    insert into public.teams (captain_id, name, format) values (v_host_id, '[E2E] Setters', 'doubles')
      returning id into v_team_3;
  end if;

  select t.id into v_team_4 from public.teams t
    where t.captain_id = v_pro_host and t.name = '[E2E] Blockers' limit 1;
  if v_team_4 is null then
    insert into public.teams (captain_id, name, format) values (v_pro_host, '[E2E] Blockers', 'doubles')
      returning id into v_team_4;
  end if;

  -- Captain is always a team_member (so they appear in their own roster).
  insert into public.team_members (team_id, user_id) values
    (v_team_1, v_attendee_a),
    (v_team_2, v_attendee_b),
    (v_team_3, v_host_id),
    (v_team_4, v_pro_host)
  on conflict do nothing;

  -- ---- Register teams to divisions -----------------------------------------
  -- A Division: teams 1 and 2.  BB Division: teams 3 and 4.
  insert into public.event_teams (event_id, team_id, division_id) values
    (v_event_roster, v_team_1, v_div_a),
    (v_event_roster, v_team_2, v_div_a),
    (v_event_roster, v_team_3, v_div_b),
    (v_event_roster, v_team_4, v_div_b)
  on conflict do nothing;

  -- ==========================================================================
  -- 3. BRACKETS — one per division (Phase 7: bracket-per-division).
  --    Each division has 2 teams, so the bracket is a single championship
  --    match in round 1.
  -- ==========================================================================
  select id into v_bracket_a from public.tournament_brackets where division_id = v_div_a;

  if v_bracket_a is null then
    insert into public.tournament_brackets (event_id, division_id, format, status)
      values (v_event_roster, v_div_a, 'single_elimination', 'setup')
      returning id into v_bracket_a;

    insert into public.bracket_seeds (bracket_id, team_id, seed) values
      (v_bracket_a, v_team_1, 1),
      (v_bracket_a, v_team_2, 2);

    insert into public.bracket_matches (
      bracket_id, round, match_number, bracket_side,
      team_a_id, team_b_id, status
    ) values (
      v_bracket_a, 1, 1, 'final',
      v_team_1, v_team_2, 'pending'
    )
    returning id into v_match_a_fin;
  end if;

  select id into v_bracket_b from public.tournament_brackets where division_id = v_div_b;

  if v_bracket_b is null then
    insert into public.tournament_brackets (event_id, division_id, format, status)
      values (v_event_roster, v_div_b, 'single_elimination', 'setup')
      returning id into v_bracket_b;

    insert into public.bracket_seeds (bracket_id, team_id, seed) values
      (v_bracket_b, v_team_3, 1),
      (v_bracket_b, v_team_4, 2);

    insert into public.bracket_matches (
      bracket_id, round, match_number, bracket_side,
      team_a_id, team_b_id, status
    ) values (
      v_bracket_b, 1, 1, 'final',
      v_team_3, v_team_4, 'pending'
    )
    returning id into v_match_b_fin;
  end if;

  raise notice 'Tournament fixture ready. Ad-hoc event: %  Roster event: %', v_event_adhoc, v_event_roster;
end
$$;

commit;
