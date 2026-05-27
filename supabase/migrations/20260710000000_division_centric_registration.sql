-- ============================================================================
-- Division-centric registration: PK widening, host opt-out toggle, and
-- (event_id, division_id) consistency triggers.
--
-- See docs/audits/registration-workflow.md (R1, R2, R6) and the journal
-- entry for Bundle 118.
--
-- Context:
--   * Bundle 5 (20260605000100) added `division_id` to event_attendees /
--     event_teams / event_free_agents but the `event_free_agents` PK was
--     never relaxed from `(event_id, user_id)`, so the column lied: only
--     one division per user is representable per event.
--   * There is no host-configurable way to opt out of the free-agent
--     pool. Hosts running pure captain-assembled brackets live with an
--     empty section and field "what's this for?" questions.
--   * `event_attendees.division_id`, `event_teams.division_id`,
--     `event_team_registrations.division_id`, and
--     `event_free_agents.division_id` are all NOT NULL FKs into
--     event_divisions, but nothing prevents an insert that uses a
--     division belonging to a *different* event. The app layer is
--     currently the only guard.
--
-- Impact:
--   * Schema:
--       - event_free_agents PK widened to (event_id, user_id, division_id).
--         Existing rows are already unique under the wider key (the old PK
--         forced one row per user-per-event), so the rewrite is lossless.
--       - event_divisions gains `allow_free_agents boolean not null
--         default true`. Existing divisions inherit the historical
--         default (free agents allowed everywhere) so behaviour is
--         unchanged on deploy.
--   * RLS:
--       - event_free_agents_insert additionally checks that the chosen
--         division has `allow_free_agents = true`.
--   * Triggers:
--       - New `assert_division_event_consistency()` function + BEFORE
--         INSERT/UPDATE triggers on event_teams,
--         event_team_registrations, and event_free_agents that raise
--         when `division_id` belongs to a different event.
--   * App layer:
--       - `VolleyballEvent.joinAsFreeAgent` now requires the chosen
--         division to have `allowFreeAgents = true`, otherwise throws
--         `InvariantViolation`. Divisions repeater (new + edit forms)
--         surfaces a per-row checkbox.
--       - Multi-division-per-user free-agent signup is *not* enabled in
--         the aggregate or UI by this migration; the data model now
--         supports it (PK widened) but the `_freeAgents` map still keys
--         per-user. That's a follow-up; the PK was the blocker.
-- ============================================================================

-- ---- R1: Widen event_free_agents PK ---------------------------------------
-- The existing PK is also the table's only unique constraint covering
-- division_id, so drop & recreate.
alter table public.event_free_agents
  drop constraint event_free_agents_pkey;

alter table public.event_free_agents
  add constraint event_free_agents_pkey
  primary key (event_id, user_id, division_id);

-- ---- R2: allow_free_agents per division -----------------------------------
alter table public.event_divisions
  add column allow_free_agents boolean not null default true;

comment on column public.event_divisions.allow_free_agents is
  'When false, this division does not accept free-agent signups. Used by hosts running pure captain-assembled brackets to suppress the free-agent panel on the event page.';

-- RLS: tighten event_free_agents_insert. The existing policy lets the
-- viewer sign themselves up for any published tournament; the new check
-- additionally requires the chosen division to permit free agents.
drop policy if exists event_free_agents_insert on public.event_free_agents;

create policy event_free_agents_insert
    on public.event_free_agents for insert with check (
        auth.uid() = user_id
        and exists (
            select 1 from public.events e
             where e.id = event_id
               and e.type = 'tournament'
               and e.status = 'published'
        )
        and exists (
            select 1 from public.event_divisions d
             where d.id = division_id
               and d.event_id = event_id
               and d.allow_free_agents = true
        )
    );

-- ---- R6: (event_id, division_id) consistency triggers ---------------------
-- Guard against `division_id` pointing at a division that belongs to a
-- different event. Applies to every table that carries both an event_id
-- and a division_id FK.
create or replace function public.assert_division_event_consistency()
returns trigger language plpgsql as $$
declare
  v_division_event_id uuid;
begin
  if NEW.division_id is null then
    return NEW;
  end if;

  select event_id into v_division_event_id
    from public.event_divisions
   where id = NEW.division_id;

  if v_division_event_id is null then
    raise exception
      'division_id % does not exist', NEW.division_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_division_event_id <> NEW.event_id then
    raise exception
      'division_id % belongs to event %, not %',
      NEW.division_id, v_division_event_id, NEW.event_id
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

create trigger event_teams_assert_division
  before insert or update of event_id, division_id on public.event_teams
  for each row execute function public.assert_division_event_consistency();

create trigger event_team_registrations_assert_division
  before insert or update of event_id, division_id on public.event_team_registrations
  for each row execute function public.assert_division_event_consistency();

create trigger event_free_agents_assert_division
  before insert or update of event_id, division_id on public.event_free_agents
  for each row execute function public.assert_division_event_consistency();

-- event_attendees also carries (event_id, division_id) but its
-- division_id is nullable (open-play default); the function already
-- short-circuits on null. Attach the trigger so future inserts can't
-- cross events either.
create trigger event_attendees_assert_division
  before insert or update of event_id, division_id on public.event_attendees
  for each row execute function public.assert_division_event_consistency();
