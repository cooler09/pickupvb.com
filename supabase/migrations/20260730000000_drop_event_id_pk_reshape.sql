-- ============================================================================
-- Step 5a (audit P2 #6.5 Bundle B) — drop denormalized `event_id` from the
-- four remaining division-scoped tables and reshape their PKs / FKs so
-- `division_id` is the only path back to the parent event.
-- See docs/audits/event-data-model.md § P2 #6.5 and § "Recommended sequencing".
--
-- Context: Bundle A (20260729000000) already dropped `event_id` from
-- `event_team_registrations` and `event_brackets`. The four remaining
-- tables — `event_attendees`, `event_teams`, `event_free_agents`, and
-- `event_team_payments` — still carry both columns. Pre-launch is the
-- destructive window: post-launch the cleanup acquires a backfill +
-- dual-write + cutover sequence that makes it permanently
-- not-worth-it.
--
-- Once `event_id` is gone from all six tables, the consistency
-- triggers installed by Bundle 118 (20260710000000) and the
-- `assert_division_event_consistency()` function exist for no reason
-- — there is only one path to the event. They come out here.
--
-- Impact:
--   * `event_attendees`: drops `event_id` (the column, the partial-unique
--     index `event_attendees_event_user_uidx`, the FK to `events`, and the
--     two reminder partial indexes that key on `event_id`). Reminder
--     indexes recreated on `division_id`; partial unique recreated on
--     `(division_id, user_id) where user_id is not null`. Adds a
--     `division_id` index since it's now the only fast path.
--   * `event_teams`: PK migrates from `(event_id, team_id)` to
--     `(division_id, team_id)`; the FK to `events` is dropped; the
--     `event_id` column is dropped.
--   * `event_free_agents`: PK migrates from
--     `(event_id, user_id, division_id)` to `(division_id, user_id)`;
--     the FK to `events`, the `event_id` column, and the
--     `event_free_agents_event_idx` index are dropped.
--   * `event_team_payments`: composite FK
--     `(event_id, team_id) -> event_teams(event_id, team_id)` retargets
--     to `(division_id, team_id) -> event_teams(division_id, team_id)`.
--     `event_id` column dropped; unique `(event_id, team_id)` replaced
--     with `(division_id, team_id)`. `event_team_payments_event_idx`
--     dropped; new `division_id` index added.
--   * Triggers dropped: `event_teams_assert_division`,
--     `event_free_agents_assert_division`, `event_attendees_assert_division`.
--     Function `public.assert_division_event_consistency()` dropped.
--   * Capacity trigger `enforce_event_capacity()` rewritten to look the
--     parent event up through `event_divisions` (the trigger fires on
--     `event_attendees` insert; `new.division_id` is the only handle).
--   * Helper `public.event_paid_attendee_count(p_event_id uuid)` rewritten
--     to join through `event_divisions` for callers (currently only the
--     generated type stub references it; rewritten for safety).
--   * Views rebuilt to join through `event_divisions`: `events_view`
--     (attendee_count / team_count), `metro_health_weekly` and
--     `host_activity_monthly` (GMV + fill-rate from `event_attendees`,
--     `event_teams`, `event_team_payments`).
--   * Policies rewritten:
--       - `events_select` (friends_of_attendees branch joins through
--         `event_divisions`).
--       - `event_attendees_delete`, `event_attendees_update_host`.
--       - `event_free_agents_insert`, `event_free_agents_delete`.
--       - `event_team_payments_insert`, `event_team_payments_update`,
--         `event_team_payments_delete`.
--     Other policies on these tables (`event_attendees_select`,
--     `event_attendees_insert`, `event_attendees_update_own_pending`,
--     `event_teams_select`, `event_teams_insert`, `event_free_agents_select`,
--     `event_team_payments_select`) do not reference `event_id` and
--     stay as-is.
--
-- App layer: every Supabase call site that filtered these tables by
-- `event_id` is updated in the same PR to filter via
-- `event_divisions!inner(event_id)` or via a pre-loaded division-id
-- list. The aggregate APIs (`EventAttendee`, `EventTeam`,
-- `EventFreeAgent`, `EventTeamPayment`) continue to expose `eventId`
-- — derived at the persistence boundary from `event_divisions.event_id`.
-- ============================================================================

-- ---- 0. Drop dependent views first so column drops succeed ----------------
drop view if exists public.metro_health_weekly;
drop view if exists public.host_activity_monthly;
drop view if exists public.events_view;

-- ---- 1. Drop consistency triggers + function ------------------------------
drop trigger if exists event_teams_assert_division        on public.event_teams;
drop trigger if exists event_free_agents_assert_division  on public.event_free_agents;
drop trigger if exists event_attendees_assert_division    on public.event_attendees;
drop function if exists public.assert_division_event_consistency();

-- Drop the legacy `fill_default_division_id` BEFORE INSERT triggers and
-- their function. The function reads `new.event_id`, which no longer
-- exists on any of the three tables after this migration. Callers must
-- now supply `division_id` explicitly (the column has been NOT NULL since
-- 20260606000000); the application repositories pass it through.
drop trigger if exists event_attendees_fill_division   on public.event_attendees;
drop trigger if exists event_teams_fill_division       on public.event_teams;
drop trigger if exists event_free_agents_fill_division on public.event_free_agents;
drop function if exists public.fill_default_division_id();

-- ---- 2. Drop policies that reference event_id (recreated below) -----------
drop policy if exists event_attendees_delete         on public.event_attendees;
drop policy if exists event_attendees_update_host    on public.event_attendees;
drop policy if exists event_free_agents_insert       on public.event_free_agents;
drop policy if exists event_free_agents_delete       on public.event_free_agents;
drop policy if exists event_team_payments_insert     on public.event_team_payments;
drop policy if exists event_team_payments_update     on public.event_team_payments;
drop policy if exists event_team_payments_delete     on public.event_team_payments;
drop policy if exists events_select                  on public.events;

-- ---- 3. event_team_payments: add division_id, backfill, retarget FK -------
-- Must happen before event_teams drops its event_id column so the join
-- below still works.
alter table public.event_team_payments
  add column division_id uuid references public.event_divisions(id) on delete cascade;

update public.event_team_payments p
   set division_id = et.division_id
  from public.event_teams et
 where et.event_id = p.event_id
   and et.team_id  = p.team_id;

alter table public.event_team_payments
  alter column division_id set not null;

-- Drop composite FK + unique that reference event_id.
alter table public.event_team_payments
  drop constraint event_team_payments_event_team_fk;
alter table public.event_team_payments
  drop constraint event_team_payments_event_team_unique;

-- Drop the event_id-keyed index (replaced by the division_id index added below).
drop index if exists public.event_team_payments_event_idx;

alter table public.event_team_payments
  drop column event_id;

-- ---- 4. event_teams: reshape PK to (division_id, team_id) -----------------
alter table public.event_teams
  drop constraint event_teams_pkey;
alter table public.event_teams
  drop constraint event_teams_event_id_fkey;
alter table public.event_teams
  drop column event_id;
alter table public.event_teams
  add primary key (division_id, team_id);

-- ---- 5. event_team_payments: re-add unique + FK against the new event_teams PK
alter table public.event_team_payments
  add constraint event_team_payments_division_team_unique unique (division_id, team_id);
alter table public.event_team_payments
  add constraint event_team_payments_division_team_fk
    foreign key (division_id, team_id)
    references public.event_teams (division_id, team_id)
    on delete cascade;

create index event_team_payments_division_idx
  on public.event_team_payments (division_id);

-- ---- 6. event_free_agents: reshape PK to (division_id, user_id) -----------
alter table public.event_free_agents
  drop constraint event_free_agents_pkey;
alter table public.event_free_agents
  drop constraint event_free_agents_event_id_fkey;
drop index if exists public.event_free_agents_event_idx;
alter table public.event_free_agents
  drop column event_id;
alter table public.event_free_agents
  add primary key (division_id, user_id);

-- ---- 7. event_attendees: drop event_id + dependent indexes ----------------
-- The surrogate UUID PK (`id`) is unchanged; only the secondary
-- structures keyed on event_id need recreation.
drop index if exists public.event_attendees_event_user_uidx;
drop index if exists public.event_attendees_reminder_24h_pending_idx;
drop index if exists public.event_attendees_reminder_2h_pending_idx;

alter table public.event_attendees
  drop constraint event_attendees_event_id_fkey;
alter table public.event_attendees
  drop column event_id;

-- Recreate the partial unique on (division_id, user_id). Live user
-- rows must still hold at most one row per division.
create unique index event_attendees_division_user_uidx
  on public.event_attendees (division_id, user_id)
  where user_id is not null;

-- Recreate reminder partial indexes by division_id (the reminders cron
-- already loads events with their divisions; switching to division_id
-- preserves the "not yet reminded" fast-path).
create index event_attendees_reminder_24h_pending_idx
  on public.event_attendees (division_id)
  where reminder_24h_sent_at is null;
create index event_attendees_reminder_2h_pending_idx
  on public.event_attendees (division_id)
  where reminder_2h_sent_at is null;

-- ---- 8. Recreate policies that referenced event_id ------------------------

-- 8a. events_select — friends_of_attendees branch joins through
-- event_divisions. Everything else is verbatim from
-- 20260702000000_invite_only_events_readable_by_link.sql.
create policy events_select on public.events for select using (
  auth.uid() = host_id
  or (
    host_group_id is not null
    and exists (
      select 1 from public.group_members gm
       where gm.group_id = events.host_group_id
         and gm.user_id  = auth.uid()
         and gm.role in ('owner', 'admin')
    )
  )
  or exists (
    select 1 from public.event_co_hosts ch
     where ch.event_id = events.id
       and (
         ch.host_user_id = auth.uid()
         or (ch.host_group_id is not null and exists (
           select 1 from public.group_members gm
            where gm.group_id = ch.host_group_id
              and gm.user_id  = auth.uid()
              and gm.role in ('owner', 'admin')
         ))
       )
  )
  or (
    status = 'published' and (
      visibility = 'public'
      or visibility = 'invite_only'
      or (
        visibility = 'friends_of_host' and (
          exists (
            select 1 from public.friendships f
             where f.user_id = events.host_id
               and f.friend_id = auth.uid()
          )
          or (host_group_id is not null and (
            exists (
              select 1 from public.group_followers gf
               where gf.group_id = events.host_group_id
                 and gf.user_id  = auth.uid()
            )
            or exists (
              select 1 from public.group_members gm
               where gm.group_id = events.host_group_id
                 and gm.user_id  = auth.uid()
            )
          ))
          or exists (
            select 1 from public.event_co_hosts ch
             where ch.event_id = events.id
               and (
                 (ch.host_user_id is not null and exists (
                    select 1 from public.friendships f
                     where f.user_id = ch.host_user_id
                       and f.friend_id = auth.uid()
                 ))
                 or (ch.host_group_id is not null and (
                    exists (
                      select 1 from public.group_followers gf
                       where gf.group_id = ch.host_group_id
                         and gf.user_id  = auth.uid()
                    )
                    or exists (
                      select 1 from public.group_members gm
                       where gm.group_id = ch.host_group_id
                         and gm.user_id  = auth.uid()
                    )
                 ))
               )
          )
        )
      )
      or (
        visibility = 'friends_of_attendees' and exists (
          select 1 from public.event_attendees a
            join public.event_divisions d on d.id = a.division_id
            join public.friendships f on f.user_id = a.user_id and f.friend_id = auth.uid()
           where d.event_id = events.id
        )
      )
    )
  )
);

-- 8b. event_attendees_delete — host check goes through event_divisions.
create policy event_attendees_delete on public.event_attendees for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1
        from public.event_divisions d
        join public.events e on e.id = d.event_id
       where d.id = division_id
         and e.host_id = auth.uid()
    )
  );

-- 8c. event_attendees_update_host — same shape, retargeted to
-- is_event_host fed by the division's event_id.
create policy event_attendees_update_host on public.event_attendees
  for update
  using (
    public.is_event_host(
      (select event_id from public.event_divisions where id = division_id)
    )
  )
  with check (
    public.is_event_host(
      (select event_id from public.event_divisions where id = division_id)
    )
  );

-- 8d. event_free_agents_insert + delete — division_id is the only handle.
create policy event_free_agents_insert
  on public.event_free_agents for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
        from public.event_divisions d
        join public.events e on e.id = d.event_id
       where d.id = division_id
         and d.allow_free_agents = true
         and e.type = 'tournament'
         and e.status = 'published'
    )
  );

create policy event_free_agents_delete
  on public.event_free_agents for delete using (
    auth.uid() = user_id
    or exists (
      select 1
        from public.event_divisions d
        join public.events e on e.id = d.event_id
       where d.id = division_id
         and e.host_id = auth.uid()
    )
  );

-- 8e. event_team_payments — captain + division/event roster check.
create policy event_team_payments_insert
  on public.event_team_payments for insert with check (
    auth.uid() = captain_id
    and exists (
      select 1 from public.event_teams et
       where et.division_id = public.event_team_payments.division_id
         and et.team_id     = public.event_team_payments.team_id
    )
    and exists (
      select 1
        from public.event_divisions d
        join public.events e on e.id = d.event_id
       where d.id = public.event_team_payments.division_id
         and d.team_registration_mode = 'roster'
         and e.status = 'published'
    )
  );

create policy event_team_payments_update
  on public.event_team_payments for update using (
    auth.uid() = captain_id
    or exists (
      select 1
        from public.event_divisions d
        join public.events e on e.id = d.event_id
       where d.id = division_id
         and e.host_id = auth.uid()
    )
  );

create policy event_team_payments_delete
  on public.event_team_payments for delete using (
    auth.uid() = captain_id
    or exists (
      select 1
        from public.event_divisions d
        join public.events e on e.id = d.event_id
       where d.id = division_id
         and e.host_id = auth.uid()
    )
  );

-- ---- 9. Rewrite enforce_event_capacity to lookup event via division -------
create or replace function public.enforce_event_capacity()
returns trigger language plpgsql as $$
declare
  primary_cap_kind  text;
  primary_max_spots int;
  current_count     int;
  v_event_id        uuid;
begin
  select event_id into v_event_id
    from public.event_divisions
   where id = new.division_id;

  if v_event_id is null then
    return new;
  end if;

  select capacity_kind, max_spots
    into primary_cap_kind, primary_max_spots
    from public.event_divisions
   where event_id = v_event_id
   order by sort_order
   limit 1;

  if primary_cap_kind = 'fixed' then
    select count(*) into current_count
      from public.event_attendees a
      join public.event_divisions d on d.id = a.division_id
     where d.event_id = v_event_id;
    if current_count >= primary_max_spots then
      raise exception 'Event % is full', v_event_id;
    end if;
  end if;
  return new;
end;
$$;

-- ---- 10. Rewrite event_paid_attendee_count to join via event_divisions ----
create or replace function public.event_paid_attendee_count(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.event_attendees a
    join public.event_divisions d on d.id = a.division_id
   where d.event_id = p_event_id and a.payment_status = 'paid'
$$;
grant execute on function public.event_paid_attendee_count(uuid) to anon, authenticated;

-- ---- 11. Rebuild events_view with division-joined aggregations ------------
create view public.events_view as
select
  e.*,
  st_x(e.geo::geometry) as longitude,
  st_y(e.geo::geometry) as latitude,
  (select count(*)
     from public.event_attendees a
     join public.event_divisions d on d.id = a.division_id
    where d.event_id = e.id)::int as attendee_count,
  (select count(*)
     from public.event_teams t
     join public.event_divisions d on d.id = t.division_id
    where d.event_id = e.id)::int as team_count
from public.events e;
grant select on public.events_view to anon, authenticated;

-- ---- 12. Rebuild public_numbers views with division-joined aggregations --
create or replace view public.metro_health_weekly
with (security_invoker = on) as
with event_rollup as (
    select
        e.id as event_id,
        e.city,
        date_trunc('week', e.starts_at) as week_start,
        coalesce(
            (
                select sum(a.amount_paid_cents)
                  from public.event_attendees a
                  join public.event_divisions d on d.id = a.division_id
                 where d.event_id = e.id and a.payment_status = 'paid'
            ),
            0
        )
        + coalesce(
            (
                select sum(p.amount_paid_cents)
                  from public.event_team_payments p
                  join public.event_divisions d on d.id = p.division_id
                 where d.event_id = e.id and p.payment_status = 'paid'
            ),
            0
        )
        + coalesce(
            (
                select sum(amount_cents)
                from public.event_tips
                where event_id = e.id and status = 'paid'
            ),
            0
        ) as gmv_cents,
        (
            select count(*)
              from public.event_attendees a
              join public.event_divisions d on d.id = a.division_id
             where d.event_id = e.id
        )
        + (
            select count(*)
              from public.event_teams t
              join public.event_divisions d on d.id = t.division_id
             where d.event_id = e.id
        ) as attendees_count,
        case
            when
                (
                    select capacity_kind from public.event_divisions
                    where event_id = e.id and sort_order = 0
                ) = 'fixed'
                and (
                    select max_spots from public.event_divisions
                    where event_id = e.id and sort_order = 0
                ) > 0
            then
                (
                    select count(*)::numeric
                      from public.event_attendees a
                      join public.event_divisions d on d.id = a.division_id
                     where d.event_id = e.id and a.payment_status in ('none', 'paid')
                )
                / (
                    select max_spots::numeric from public.event_divisions
                    where event_id = e.id and sort_order = 0
                )
            else null
        end as fill_rate
    from public.events e
    where e.status = 'published' and e.visibility = 'public'
)
select
    city as metro,
    week_start,
    count(*)::int as events_count,
    sum(attendees_count)::int as attendees_count,
    sum(gmv_cents)::bigint as gmv_cents,
    avg(fill_rate) filter (where fill_rate is not null) as avg_fill_rate
from event_rollup
group by city, week_start;

comment on view public.metro_health_weekly is
    'Weekly per-city totals over published public events. Safe to expose to anon for marketing surfaces.';

grant select on public.metro_health_weekly to anon, authenticated;

create or replace view public.host_activity_monthly
with (security_invoker = on) as
select
    e.host_id,
    date_trunc('month', e.starts_at) as month_start,
    count(*)::int as events_count,
    coalesce(
        sum(
            coalesce(
                (
                    select sum(a.amount_paid_cents)
                      from public.event_attendees a
                      join public.event_divisions d on d.id = a.division_id
                     where d.event_id = e.id and a.payment_status = 'paid'
                ),
                0
            )
            + coalesce(
                (
                    select sum(p.amount_paid_cents)
                      from public.event_team_payments p
                      join public.event_divisions d on d.id = p.division_id
                     where d.event_id = e.id and p.payment_status = 'paid'
                ),
                0
            )
            + coalesce(
                (
                    select sum(amount_cents)
                    from public.event_tips
                    where event_id = e.id and status = 'paid'
                ),
                0
            )
        ),
        0
    )::bigint as gmv_cents,
    avg(
        case
            when
                (
                    select capacity_kind from public.event_divisions
                    where event_id = e.id and sort_order = 0
                ) = 'fixed'
                and (
                    select max_spots from public.event_divisions
                    where event_id = e.id and sort_order = 0
                ) > 0
            then
                (
                    select count(*)::numeric
                      from public.event_attendees a
                      join public.event_divisions d on d.id = a.division_id
                     where d.event_id = e.id and a.payment_status in ('none', 'paid')
                )
                / (
                    select max_spots::numeric from public.event_divisions
                    where event_id = e.id and sort_order = 0
                )
            else null
        end
    ) as avg_fill_rate
from public.events e
where e.status = 'published'
  and e.host_id = auth.uid()
group by e.host_id, date_trunc('month', e.starts_at);

grant select on public.host_activity_monthly to authenticated;

-- ---- 13. Index recap ------------------------------------------------------
-- event_attendees: PK (id) [unchanged], partial unique (division_id, user_id)
-- where user_id is not null [recreated], reminder partial indexes on
-- division_id [recreated], existing payment_intent / session indexes
-- [unchanged], division_id covered by the partial unique above.
--
-- event_teams: PK (division_id, team_id) [new].
-- event_free_agents: PK (division_id, user_id) [new].
-- event_team_payments: PK (id) [unchanged], unique (division_id, team_id)
-- [new], division_idx (new), captain_idx / session_idx / pi_idx [unchanged].
