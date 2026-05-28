-- ============================================================================
-- P2 #6.6 — Collapse event_teams + event_team_registrations + members into
-- event_team_entries + event_team_entry_members. Retarget event_team_payments
-- from the (division_id, team_id) composite onto a single entry_id FK.
-- See docs/audits/event-data-model.md § P2 #6.6.
--
-- Context: today three tables model "a team participating in a division" —
-- `event_teams` (roster mode, FK to persistent `teams`), and
-- `event_team_registrations` + `event_team_registration_members` (ad-hoc /
-- walk-in mode, inline name + member list). The discriminator is which
-- table the row lives in, plus a `source` column on registrations
-- (captain | host | walk_in). The duplication forces every read site, RLS
-- policy, and payment join to branch — and `event_team_payments`
-- silently only covers the roster half (ad-hoc payment state is duplicated
-- inline on `event_team_registrations`). Pre-launch is the only window
-- where a single backfill + drop is acceptable; post-launch this becomes
-- a dual-write + read-cutover that's permanently not-worth-it.
--
-- Impact (destructive, pre-launch):
--   * New tables: `event_team_entries` (replaces both roster & ad-hoc
--     team rows; `source in ('roster','ad_hoc','walk_in')` discriminator)
--     and `event_team_entry_members` (replaces ad-hoc members AND a
--     roster-time snapshot from `team_members`).
--   * `event_team_payments` retargets: drop `(division_id, team_id)`
--     composite; add `entry_id` single-column FK to `event_team_entries(id)`
--     ON DELETE CASCADE; add `payment_note` column (absorbed from ad-hoc
--     `event_team_registrations`).
--   * Backfill order matters: (a) insert roster entries from
--     event_teams JOIN teams; (b) snapshot team_members into
--     entry_members for those entries; (c) insert ad-hoc/walk-in entries
--     from event_team_registrations (captain/host → ad_hoc, walk_in
--     preserved); (d) copy registration_members → entry_members;
--     (e) backfill event_team_payments.entry_id from the roster map;
--     (f) insert new event_team_payments rows for any ad_hoc/walk_in
--     registration whose inline payment state was non-default.
--   * Old tables dropped: event_team_registration_members,
--     event_team_registrations, event_teams. Public narrow view
--     event_team_registration_members_public is replaced with
--     event_team_entry_members_public.
--   * RLS rewritten on all three new surfaces. event_team_entries gains
--     a 3-branch insert policy (captain ad-hoc / captain roster /
--     host walk_in). entry_members uses the same captain-or-host-or-self
--     PII gate the registration_members PII migration installed.
--     event_team_payments select/insert/update/delete all rewrite to
--     resolve event/division through event_team_entries.
--   * Source enum compression is irreversible: the captain/host
--     distinction on event_team_registrations is folded into 'ad_hoc'
--     (the captain_id NULL/NOT-NULL split preserves the only material
--     difference — whether a real account stands behind the row).
--   * Realtime publication members updated: event_teams + (already-added)
--     event_team_payments are replaced by event_team_entries +
--     event_team_payments.
--   * Views rebuilt: events_view's team_count joins through entries;
--     metro_health_weekly + host_activity_monthly's payment sums join
--     through entries to reach event_id (since payments lost division_id).
-- ============================================================================

-- ---- 0. Drop dependent views ---------------------------------------------
drop view if exists public.events_view;
drop view if exists public.event_team_registration_members_public;
drop view if exists public.host_activity_monthly;
drop view if exists public.metro_health_weekly;

-- ---- 1. Drop publication memberships for tables that will be dropped
alter publication supabase_realtime drop table public.event_teams;
alter publication supabase_realtime drop table public.event_team_payments;

-- ---- 2. Drop touch triggers + functions tied to old tables ---------------
drop trigger if exists event_team_registrations_touch_updated_at
  on public.event_team_registrations;
drop function if exists public.touch_event_team_registrations_updated_at();

drop trigger if exists event_team_payments_touch_updated_at
  on public.event_team_payments;
drop function if exists public.touch_event_team_payments_updated_at();

-- ---- 3. Drop RLS policies on tables being merged / retargeted ------------
drop policy if exists event_teams_select on public.event_teams;
drop policy if exists event_teams_insert on public.event_teams;
drop policy if exists event_teams_delete on public.event_teams;

drop policy if exists event_team_registrations_select on public.event_team_registrations;
drop policy if exists event_team_registrations_insert on public.event_team_registrations;
drop policy if exists event_team_registrations_update on public.event_team_registrations;
drop policy if exists event_team_registrations_delete on public.event_team_registrations;

drop policy if exists event_team_registration_members_select on public.event_team_registration_members;
drop policy if exists event_team_registration_members_insert on public.event_team_registration_members;
drop policy if exists event_team_registration_members_update on public.event_team_registration_members;
drop policy if exists event_team_registration_members_delete on public.event_team_registration_members;

drop policy if exists event_team_payments_select on public.event_team_payments;
drop policy if exists event_team_payments_insert on public.event_team_payments;
drop policy if exists event_team_payments_update on public.event_team_payments;
drop policy if exists event_team_payments_delete on public.event_team_payments;

-- ---- 4. Create event_team_entries ----------------------------------------
create table public.event_team_entries (
  id                    uuid primary key default uuid_generate_v4(),
  division_id           uuid not null references public.event_divisions(id) on delete cascade,
  source                text not null check (source in ('roster', 'ad_hoc', 'walk_in')),
  team_id               uuid references public.teams(id) on delete restrict,
  captain_id            uuid references public.profiles(id) on delete cascade,
  captain_display_name  text check (captain_display_name is null
                                    or char_length(btrim(captain_display_name)) between 1 and 80),
  captain_phone         text check (captain_phone is null
                                    or char_length(btrim(captain_phone)) between 1 and 40),
  name                  text not null check (char_length(name) between 1 and 80),
  registered_at         timestamptz not null default now(),
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Roster entries point at a persistent team; ad-hoc/walk-in entries don't.
  constraint event_team_entries_team_matches_source
    check ((source = 'roster') = (team_id is not null)),

  -- Captain identity matches source: roster/ad_hoc must have captain_id,
  -- walk_in carries a freeform display name with captain_id null.
  constraint event_team_entries_captain_identity
    check (
      (source = 'walk_in'  and captain_id is null and captain_display_name is not null)
      or
      (source in ('roster', 'ad_hoc') and captain_id is not null)
    )
);

create index event_team_entries_division_idx
  on public.event_team_entries (division_id);
create index event_team_entries_team_idx
  on public.event_team_entries (team_id)
  where team_id is not null;
create index event_team_entries_captain_idx
  on public.event_team_entries (captain_id)
  where captain_id is not null;
create index event_team_entries_division_source_idx
  on public.event_team_entries (division_id, source);
create index event_team_entries_deleted_at_idx
  on public.event_team_entries (deleted_at)
  where deleted_at is not null;

-- Roster: at most one live entry per (division, team).
create unique index event_team_entries_division_team_uidx
  on public.event_team_entries (division_id, team_id)
  where team_id is not null and deleted_at is null;

create or replace function public.touch_event_team_entries_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger event_team_entries_touch_updated_at
  before update on public.event_team_entries
  for each row execute function public.touch_event_team_entries_updated_at();

-- ---- 5. Create event_team_entry_members ----------------------------------
create table public.event_team_entry_members (
  id            uuid primary key default uuid_generate_v4(),
  entry_id      uuid not null references public.event_team_entries(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,
  display_name  text check (display_name is null or char_length(display_name) between 1 and 80),
  email         text check (email is null or char_length(email) between 3 and 254),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),

  constraint event_team_entry_members_has_identity
    check (user_id is not null or display_name is not null)
);

create index event_team_entry_members_entry_idx
  on public.event_team_entry_members (entry_id);
create index event_team_entry_members_user_idx
  on public.event_team_entry_members (user_id)
  where user_id is not null;

-- ---- 6. Backfill roster entries from event_teams + teams -----------------
-- Pre-allocate entry ids so we can build (division_id, team_id) → entry_id
-- and (registration_id → entry_id) lookups for the payment retarget.
create temp table _etp_roster_map (
  division_id uuid not null,
  team_id     uuid not null,
  entry_id    uuid not null,
  primary key (division_id, team_id)
);

with src as (
  select
    et.division_id,
    et.team_id,
    et.registered_at,
    t.captain_id,
    t.name,
    uuid_generate_v4() as entry_id
  from public.event_teams et
  join public.teams t on t.id = et.team_id
),
inserted as (
  insert into public.event_team_entries
    (id, division_id, source, team_id, captain_id, name,
     registered_at, created_at, updated_at)
  select
    src.entry_id,
    src.division_id,
    'roster',
    src.team_id,
    src.captain_id,
    src.name,
    src.registered_at,
    src.registered_at,
    src.registered_at
  from src
  returning id
)
insert into _etp_roster_map (division_id, team_id, entry_id)
select s.division_id, s.team_id, s.entry_id from src s;

-- Snapshot team_members into entry_members for each roster entry. Captures
-- the roster as it stood at migration time — future edits to team_members
-- do NOT retroactively change in-progress event registrations.
insert into public.event_team_entry_members (entry_id, user_id, sort_order, created_at)
select m.entry_id, tm.user_id, 0, tm.joined_at
from _etp_roster_map m
join public.team_members tm on tm.team_id = m.team_id;

-- ---- 7. Backfill ad-hoc / walk-in entries --------------------------------
create temp table _etr_map (
  registration_id uuid primary key,
  entry_id        uuid not null
);

insert into _etr_map (registration_id, entry_id)
select id, uuid_generate_v4()
from public.event_team_registrations;

insert into public.event_team_entries
  (id, division_id, source, captain_id, captain_display_name, captain_phone,
   name, registered_at, deleted_at, created_at, updated_at)
select
  m.entry_id,
  r.division_id,
  case when r.source = 'walk_in' then 'walk_in' else 'ad_hoc' end,
  r.captain_id,
  r.captain_display_name,
  r.captain_phone,
  r.name,
  r.created_at,
  r.deleted_at,
  r.created_at,
  r.updated_at
from public.event_team_registrations r
join _etr_map m on m.registration_id = r.id;

insert into public.event_team_entry_members
  (entry_id, user_id, display_name, email, sort_order, created_at)
select m.entry_id, em.user_id, em.display_name, em.email, em.sort_order, em.created_at
from public.event_team_registration_members em
join _etr_map m on m.registration_id = em.registration_id;

-- ---- 8. event_team_payments: add entry_id + payment_note, backfill -------
alter table public.event_team_payments
  add column entry_id     uuid,
  add column payment_note text
    check (payment_note is null or char_length(payment_note) <= 500);

-- (a) Roster payments retargeted via roster map
update public.event_team_payments p
   set entry_id = m.entry_id
  from _etp_roster_map m
 where m.division_id = p.division_id
   and m.team_id     = p.team_id;

-- (b) Insert new payment rows for any ad_hoc/walk_in registration that
--     had inline non-default payment state (Bundle 117 inline payment cols)
insert into public.event_team_payments
  (entry_id, captain_id, payment_status, checkout_session_id, payment_intent_id,
   amount_paid_cents, paid_at, payment_note, created_at, updated_at)
select
  m.entry_id,
  r.captain_id,
  r.payment_status,
  r.checkout_session_id,
  r.payment_intent_id,
  r.amount_paid_cents,
  r.paid_at,
  r.payment_note,
  r.created_at,
  r.updated_at
from public.event_team_registrations r
join _etr_map m on m.registration_id = r.id
where r.payment_status <> 'none'
   or r.checkout_session_id is not null
   or r.payment_intent_id   is not null
   or r.payment_note        is not null;

-- Drop the old composite FK + unique + supporting index, then drop the
-- denormalized cols.
alter table public.event_team_payments
  drop constraint event_team_payments_division_team_fk;
alter table public.event_team_payments
  drop constraint event_team_payments_division_team_unique;
drop index if exists public.event_team_payments_division_idx;

alter table public.event_team_payments
  drop column division_id,
  drop column team_id;

-- Add the entry-keyed FK + unique + NOT NULL.
alter table public.event_team_payments
  alter column entry_id set not null,
  add constraint event_team_payments_entry_unique unique (entry_id),
  add constraint event_team_payments_entry_fk
    foreign key (entry_id) references public.event_team_entries(id) on delete cascade;

create index event_team_payments_entry_idx
  on public.event_team_payments (entry_id);

create or replace function public.touch_event_team_payments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger event_team_payments_touch_updated_at
  before update on public.event_team_payments
  for each row execute function public.touch_event_team_payments_updated_at();

-- ---- 8b. event_divisions winner FK collapse ------------------------------
-- The legacy `winner_team_id` (FK → teams) / `winner_team_registration_id`
-- (FK → event_team_registrations) pair forced every consumer to branch on
-- which kind of "team" won. With both roster + ad-hoc/walk-in now living in
-- `event_team_entries`, collapse both columns into a single
-- `winner_entry_id` FK → event_team_entries(id). Backfill from the two
-- maps built above (roster + registration). The old CHECK constraints +
-- partial indexes referencing the dropped columns must come down first.
alter table public.event_divisions
  drop constraint if exists event_divisions_winner_exclusive,
  drop constraint if exists event_divisions_winner_recorded_match;
drop index if exists public.event_divisions_winner_team_idx;
drop index if exists public.event_divisions_winner_team_registration_idx;

alter table public.event_divisions
  add column winner_entry_id uuid
    references public.event_team_entries(id) on delete set null;

update public.event_divisions d
   set winner_entry_id = m.entry_id
  from _etp_roster_map m
 where d.winner_team_id is not null
   and m.division_id = d.id
   and m.team_id     = d.winner_team_id;

update public.event_divisions d
   set winner_entry_id = m.entry_id
  from _etr_map m
 where d.winner_team_registration_id is not null
   and m.registration_id = d.winner_team_registration_id;

alter table public.event_divisions
  drop column winner_team_id,
  drop column winner_team_registration_id;

alter table public.event_divisions
  add constraint event_divisions_winner_recorded_match
    check ((winner_entry_id is null) = (winner_recorded_at is null));

create index event_divisions_winner_entry_idx
  on public.event_divisions (winner_entry_id)
  where winner_entry_id is not null;

-- ---- 9. Drop old tables --------------------------------------------------
drop table public.event_team_registration_members;
drop table public.event_team_registrations;
drop table public.event_teams;

-- ---- 10. RLS on event_team_entries --------------------------------------
alter table public.event_team_entries enable row level security;

-- Read: anyone can see live (non-soft-deleted) entries. Event-level
-- visibility is gated upstream at the events table.
create policy event_team_entries_select
  on public.event_team_entries for select using (deleted_at is null);

-- Insert: three branches.
--   (a) Captain ad-hoc self-signup on an ad_hoc division.
--   (b) Captain registers a persistent team on a roster division
--       (must be the captain of that persistent team).
--   (c) Host insert on an ad_hoc division (host walk_in + host-proxy).
-- Co-host inserts continue to route through the admin client (RLS bypass).
create policy event_team_entries_insert
  on public.event_team_entries for insert with check (
    (
      source = 'ad_hoc'
      and auth.uid() = captain_id
      and exists (
        select 1
          from public.events e
          join public.event_divisions d on d.event_id = e.id
         where d.id = division_id
           and e.status = 'published'
           and d.team_registration_mode = 'ad_hoc'
      )
    )
    or
    (
      source = 'roster'
      and auth.uid() = captain_id
      and exists (
        select 1 from public.teams t
         where t.id = team_id and t.captain_id = auth.uid()
      )
      and exists (
        select 1
          from public.events e
          join public.event_divisions d on d.event_id = e.id
         where d.id = division_id
           and e.status = 'published'
           and d.team_registration_mode = 'roster'
      )
    )
    or
    (
      source in ('ad_hoc', 'walk_in')
      and exists (
        select 1
          from public.events e
          join public.event_divisions d on d.event_id = e.id
         where d.id = division_id
           and e.status = 'published'
           and d.team_registration_mode = 'ad_hoc'
           and e.host_id = auth.uid()
      )
    )
  );

create policy event_team_entries_update
  on public.event_team_entries for update using (
    auth.uid() = captain_id
    or exists (
      select 1
        from public.event_divisions d
        join public.events e on e.id = d.event_id
       where d.id = division_id and e.host_id = auth.uid()
    )
  );

create policy event_team_entries_delete
  on public.event_team_entries for delete using (
    auth.uid() = captain_id
    or exists (
      select 1
        from public.event_divisions d
        join public.events e on e.id = d.event_id
       where d.id = division_id and e.host_id = auth.uid()
    )
  );

-- ---- 11. RLS on event_team_entry_members --------------------------------
alter table public.event_team_entry_members enable row level security;

-- Select tightened the way registration_members got tightened in the PII
-- pass (20260622): captain / host / self only.
create policy event_team_entry_members_select
  on public.event_team_entry_members for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.event_team_entries en
       where en.id = entry_id and en.captain_id = auth.uid()
    )
    or exists (
      select 1
        from public.event_team_entries en
        join public.event_divisions d on d.id = en.division_id
        join public.events e on e.id = d.event_id
       where en.id = entry_id and e.host_id = auth.uid()
    )
  );

create policy event_team_entry_members_insert
  on public.event_team_entry_members for insert with check (
    exists (
      select 1 from public.event_team_entries en
       where en.id = entry_id
         and (
           en.captain_id = auth.uid()
           or exists (
             select 1
               from public.event_divisions d
               join public.events e on e.id = d.event_id
              where d.id = en.division_id and e.host_id = auth.uid()
           )
         )
    )
  );

create policy event_team_entry_members_update
  on public.event_team_entry_members for update using (
    exists (
      select 1 from public.event_team_entries en
       where en.id = entry_id
         and (
           en.captain_id = auth.uid()
           or exists (
             select 1
               from public.event_divisions d
               join public.events e on e.id = d.event_id
              where d.id = en.division_id and e.host_id = auth.uid()
           )
         )
    )
  );

create policy event_team_entry_members_delete
  on public.event_team_entry_members for delete using (
    exists (
      select 1 from public.event_team_entries en
       where en.id = entry_id
         and (
           en.captain_id = auth.uid()
           or exists (
             select 1
               from public.event_divisions d
               join public.events e on e.id = d.event_id
              where d.id = en.division_id and e.host_id = auth.uid()
           )
         )
    )
  );

-- Narrow public projection (no email, no user_id) — replaces
-- event_team_registration_members_public.
create view public.event_team_entry_members_public as
  select id, entry_id, display_name, sort_order
  from public.event_team_entry_members;
grant select on public.event_team_entry_members_public to anon, authenticated;

-- ---- 12. RLS on event_team_payments (rewritten for entry_id) ------------
create policy event_team_payments_select
  on public.event_team_payments for select using (true);

create policy event_team_payments_insert
  on public.event_team_payments for insert with check (
    auth.uid() = captain_id
    and exists (
      select 1
        from public.event_team_entries en
        join public.event_divisions  d  on d.id = en.division_id
        join public.events           e  on e.id = d.event_id
       where en.id = entry_id
         and en.captain_id = auth.uid()
         and en.source = 'roster'
         and e.status  = 'published'
         and d.team_registration_mode = 'roster'
    )
  );

create policy event_team_payments_update
  on public.event_team_payments for update using (
    auth.uid() = captain_id
    or exists (
      select 1
        from public.event_team_entries en
        join public.event_divisions  d  on d.id = en.division_id
        join public.events           e  on e.id = d.event_id
       where en.id = entry_id and e.host_id = auth.uid()
    )
  );

create policy event_team_payments_delete
  on public.event_team_payments for delete using (
    auth.uid() = captain_id
    or exists (
      select 1
        from public.event_team_entries en
        join public.event_divisions  d  on d.id = en.division_id
        join public.events           e  on e.id = d.event_id
       where en.id = entry_id and e.host_id = auth.uid()
    )
  );

-- ---- 13. Realtime publication --------------------------------------------
alter publication supabase_realtime add table public.event_team_entries;
alter publication supabase_realtime add table public.event_team_payments;

-- ---- 14. Rebuild dependent views -----------------------------------------
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
     from public.event_team_entries t
     join public.event_divisions d on d.id = t.division_id
    where d.event_id = e.id and t.deleted_at is null)::int as team_count
from public.events e;
grant select on public.events_view to anon, authenticated;

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
                  join public.event_team_entries en on en.id = p.entry_id
                  join public.event_divisions d on d.id = en.division_id
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
              from public.event_team_entries t
              join public.event_divisions d on d.id = t.division_id
             where d.event_id = e.id and t.deleted_at is null
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
                      join public.event_team_entries en on en.id = p.entry_id
                      join public.event_divisions d on d.id = en.division_id
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
