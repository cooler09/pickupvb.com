-- ============================================================================
-- Collapse event_attendees + event_free_agents into event_participants
-- (P2 #6.7 from docs/audits/event-data-model.md). Mirrors the Step 5b shape
-- used for event_team_entries / event_team_payments.
--
-- Context: event_attendees and event_free_agents are two near-identical
-- child tables of event_divisions that carry parallel everything — parallel
-- RLS policies, parallel fill-division triggers (already removed in 5a),
-- parallel host-view joins, parallel capacity plumbing. The audit calls out
-- that nothing prevents a user from being both an attendee AND a free agent
-- in the same division (no mutual-exclusion), and that every cross-cutting
-- query (capacity, payments rollup, broadcasts, CSV export) has to know
-- about both. Collapsing to one table with a `role` discriminator gives us
-- a single partial-unique index that enforces mutual-exclusion on
-- (division_id, user_id) for any role, and a single join target for every
-- cross-cutting query.
--
-- Impact (thin pass with bridge views):
--   * NEW canonical tables: `event_participants` (one row per user-on-a-
--     division, regardless of attendee vs free-agent role) and
--     `event_participant_payments` (1:1 with attendee participants, payment
--     state lives here per the 5b precedent).
--   * `event_attendees` and `event_free_agents` are recreated as
--     SECURITY INVOKER VIEWS over the canonical tables, with INSTEAD OF
--     INSERT/UPDATE/DELETE triggers so existing app-level
--     `.from('event_attendees')` / `.from('event_free_agents')` calls keep
--     working unchanged.
--   * Existing RLS posture is reproduced on the canonical table — public
--     read, own-row insert/delete, host insert/update via is_event_host.
--     Bridge views inherit it (SECURITY INVOKER).
--   * `events_select` policy on `public.events` recreated to join through
--     event_participants role='attendee' (replaces the friends_of_attendees
--     branch that referenced event_attendees).
--   * Capacity trigger `enforce_event_capacity()` rewritten to count
--     event_participants WHERE role='attendee', and re-attached to
--     event_participants (not the bridge view — INSTEAD OF triggers fire
--     too late for capacity rejection).
--   * Dependent views (events_view, metro_health_weekly, host_activity_monthly)
--     rebuilt to read event_participants directly with role='attendee'.
--   * `event_paid_attendee_count(uuid)` rewritten the same way.
--   * Realtime publication now covers `event_participants`. The single
--     client subscriber (use-event-attendees hook) needs to filter the
--     callback to role='attendee' — covered in the matching app-layer
--     change. The bridge view itself can't be in the publication.
--   * Mutual-exclusion: partial unique index on
--     (division_id, user_id) WHERE user_id IS NOT NULL applies across
--     roles, so a user can't be both attendee and free-agent in the same
--     division. Backfill order (attendees first, then free agents only
--     where the (division, user) pair doesn't already exist as an
--     attendee) avoids any failed inserts at backfill time.
--   * Backfill preserves event_attendees.id as event_participants.id so
--     external references (Stripe checkout metadata, webhook lookups)
--     keep resolving. Free agents had a composite PK and get fresh UUIDs.
-- ============================================================================

-- ---- 1. Drop dependent views/functions/policies (recreated below) --------
--
-- DROP TABLE event_attendees CASCADE would cascade-drop these, but doing
-- them explicitly keeps the migration self-documenting and lets the
-- recreate-below blocks match the same names verbatim.

drop view if exists public.events_view;
drop view if exists public.metro_health_weekly;
drop view if exists public.host_activity_monthly;

drop function if exists public.event_paid_attendee_count(uuid);

drop policy if exists events_select on public.events;

-- ---- 2. Canonical tables -------------------------------------------------

create table public.event_participants (
  id                    uuid primary key default gen_random_uuid(),
  division_id           uuid not null references public.event_divisions(id) on delete cascade,
  user_id               uuid references public.profiles(id) on delete cascade,
  role                  text not null check (role in ('attendee', 'free_agent')),
  notes                 text check (notes is null or char_length(notes) <= 280),
  position              text check (position is null or position in ('setter','outside','middle','opposite','libero')),
  joined_at             timestamptz not null default now(),
  reminder_24h_sent_at  timestamptz,
  reminder_2h_sent_at   timestamptz,
  constraint event_participants_role_data_check check (
    -- attendees don't carry free-agent notes; free agents don't carry
    -- attendee position or reminder timestamps.
    (role = 'attendee' and notes is null)
    or
    (role = 'free_agent'
      and position is null
      and reminder_24h_sent_at is null
      and reminder_2h_sent_at  is null)
  )
);

-- Mutual-exclusion: at most one participant row per (division, user),
-- across any role. Anonymous rows (user_id IS NULL) are unconstrained.
create unique index event_participants_division_user_uidx
  on public.event_participants (division_id, user_id)
  where user_id is not null;

create index event_participants_division_role_idx
  on public.event_participants (division_id, role);

create index event_participants_user_idx
  on public.event_participants (user_id);

create index event_participants_reminder_24h_pending_idx
  on public.event_participants (division_id)
  where role = 'attendee' and reminder_24h_sent_at is null;

create index event_participants_reminder_2h_pending_idx
  on public.event_participants (division_id)
  where role = 'attendee' and reminder_2h_sent_at is null;

create table public.event_participant_payments (
  participant_id        uuid primary key references public.event_participants(id) on delete cascade,
  payment_status        text not null default 'pending'
                          check (payment_status in ('none','pending','paid','refunded')),
  checkout_session_id   text,
  payment_intent_id     text,
  amount_paid_cents     int,
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index event_participant_payments_status_idx
  on public.event_participant_payments (payment_status);

create index event_participant_payments_checkout_session_idx
  on public.event_participant_payments (checkout_session_id)
  where checkout_session_id is not null;

create index event_participant_payments_payment_intent_idx
  on public.event_participant_payments (payment_intent_id)
  where payment_intent_id is not null;

-- ---- 3. Backfill ---------------------------------------------------------
--
-- Attendees first (preserve id). Free agents next, skipping any
-- (division, user) pair already inserted as an attendee — the partial
-- unique index would otherwise reject the row. Production data is not
-- expected to contain such overlaps (the audit notes the gap as
-- theoretical), but the COALESCE/skip keeps the migration idempotent on
-- mixed snapshots.

insert into public.event_participants (
  id, division_id, user_id, role, position, joined_at,
  reminder_24h_sent_at, reminder_2h_sent_at
)
select
  a.id,
  a.division_id,
  a.user_id,
  'attendee'::text,
  a.position,
  a.joined_at,
  a.reminder_24h_sent_at,
  a.reminder_2h_sent_at
from public.event_attendees a;

insert into public.event_participant_payments (
  participant_id, payment_status, checkout_session_id, payment_intent_id,
  amount_paid_cents, paid_at
)
select
  a.id,
  coalesce(a.payment_status, 'pending'),
  a.checkout_session_id,
  a.payment_intent_id,
  a.amount_paid_cents,
  a.paid_at
from public.event_attendees a;

insert into public.event_participants (
  division_id, user_id, role, notes, joined_at
)
select
  f.division_id,
  f.user_id,
  'free_agent'::text,
  f.notes,
  f.joined_at
from public.event_free_agents f
where not exists (
  select 1 from public.event_participants p
  where p.division_id = f.division_id and p.user_id = f.user_id
);

-- ---- 4. Drop the old tables (auto-removes the legacy capacity trigger,
-- realtime publication entries, and any remaining FK indexes). ------------

drop table if exists public.event_attendees   cascade;
drop table if exists public.event_free_agents cascade;

-- ---- 5. Bridge views -----------------------------------------------------
--
-- Same column shape as the dropped tables; SECURITY INVOKER so RLS on
-- event_participants / event_participant_payments applies to the caller.

create view public.event_attendees with (security_invoker = on) as
select
  p.id,
  p.division_id,
  p.user_id,
  p.joined_at,
  p.position,
  coalesce(pay.payment_status, 'pending')   as payment_status,
  pay.amount_paid_cents,
  pay.checkout_session_id,
  pay.payment_intent_id,
  pay.paid_at,
  p.reminder_24h_sent_at,
  p.reminder_2h_sent_at
from public.event_participants p
left join public.event_participant_payments pay on pay.participant_id = p.id
where p.role = 'attendee';

grant select, insert, update, delete on public.event_attendees to anon, authenticated;

create view public.event_free_agents with (security_invoker = on) as
select
  p.division_id,
  p.user_id,
  p.notes,
  p.joined_at
from public.event_participants p
where p.role = 'free_agent';

grant select, insert, update, delete on public.event_free_agents to anon, authenticated;

-- ---- 6. INSTEAD OF triggers on the bridge views --------------------------

create or replace function public.event_attendees_bridge_insert()
returns trigger language plpgsql security invoker as $$
declare
  v_id uuid;
begin
  insert into public.event_participants (
    id, division_id, user_id, role, position, joined_at,
    reminder_24h_sent_at, reminder_2h_sent_at
  ) values (
    coalesce(new.id, gen_random_uuid()),
    new.division_id,
    new.user_id,
    'attendee',
    new.position,
    coalesce(new.joined_at, now()),
    new.reminder_24h_sent_at,
    new.reminder_2h_sent_at
  ) returning id into v_id;

  insert into public.event_participant_payments (
    participant_id, payment_status, checkout_session_id, payment_intent_id,
    amount_paid_cents, paid_at
  ) values (
    v_id,
    coalesce(new.payment_status, 'pending'),
    new.checkout_session_id,
    new.payment_intent_id,
    new.amount_paid_cents,
    new.paid_at
  );

  new.id := v_id;
  return new;
end;
$$;

create trigger event_attendees_bridge_insert_trg
  instead of insert on public.event_attendees
  for each row execute function public.event_attendees_bridge_insert();

create or replace function public.event_attendees_bridge_update()
returns trigger language plpgsql security invoker as $$
begin
  update public.event_participants set
    division_id          = new.division_id,
    user_id              = new.user_id,
    position             = new.position,
    joined_at            = new.joined_at,
    reminder_24h_sent_at = new.reminder_24h_sent_at,
    reminder_2h_sent_at  = new.reminder_2h_sent_at
  where id = old.id;

  update public.event_participant_payments set
    payment_status       = coalesce(new.payment_status, 'pending'),
    checkout_session_id  = new.checkout_session_id,
    payment_intent_id    = new.payment_intent_id,
    amount_paid_cents    = new.amount_paid_cents,
    paid_at              = new.paid_at,
    updated_at           = now()
  where participant_id = old.id;

  return new;
end;
$$;

create trigger event_attendees_bridge_update_trg
  instead of update on public.event_attendees
  for each row execute function public.event_attendees_bridge_update();

create or replace function public.event_attendees_bridge_delete()
returns trigger language plpgsql security invoker as $$
begin
  delete from public.event_participants where id = old.id;
  return old;
end;
$$;

create trigger event_attendees_bridge_delete_trg
  instead of delete on public.event_attendees
  for each row execute function public.event_attendees_bridge_delete();

create or replace function public.event_free_agents_bridge_insert()
returns trigger language plpgsql security invoker as $$
begin
  insert into public.event_participants (
    division_id, user_id, role, notes, joined_at
  ) values (
    new.division_id, new.user_id, 'free_agent', new.notes,
    coalesce(new.joined_at, now())
  );
  return new;
end;
$$;

create trigger event_free_agents_bridge_insert_trg
  instead of insert on public.event_free_agents
  for each row execute function public.event_free_agents_bridge_insert();

create or replace function public.event_free_agents_bridge_update()
returns trigger language plpgsql security invoker as $$
begin
  update public.event_participants set
    notes     = new.notes,
    joined_at = new.joined_at
  where role = 'free_agent'
    and division_id = old.division_id
    and user_id     = old.user_id;
  return new;
end;
$$;

create trigger event_free_agents_bridge_update_trg
  instead of update on public.event_free_agents
  for each row execute function public.event_free_agents_bridge_update();

create or replace function public.event_free_agents_bridge_delete()
returns trigger language plpgsql security invoker as $$
begin
  delete from public.event_participants
   where role = 'free_agent'
     and division_id = old.division_id
     and user_id     = old.user_id;
  return old;
end;
$$;

create trigger event_free_agents_bridge_delete_trg
  instead of delete on public.event_free_agents
  for each row execute function public.event_free_agents_bridge_delete();

-- ---- 7. RLS on the canonical tables --------------------------------------

alter table public.event_participants         enable row level security;
alter table public.event_participant_payments enable row level security;

-- Public read (matches previous event_attendees_select / event_free_agents_select).
create policy event_participants_select on public.event_participants
  for select using (true);

-- Insert: own row only. Free-agent rows require a non-anon session + a
-- division that has allow_free_agents on a published tournament event
-- (mirrors the post-pivot event_free_agents_insert policy). Attendee
-- inserts stay unguarded for anons — matches the explicit comment in
-- 20260513001100_anon_auth_pivot.sql ("event_attendees_insert
-- intentionally NOT guarded — anons RSVPing is the whole point").
create policy event_participants_insert on public.event_participants
  for insert with check (
    auth.uid() = user_id
    and (
      role = 'attendee'
      or (
        role = 'free_agent'
        and not public.is_anon_session()
        and exists (
          select 1
            from public.event_divisions d
            join public.events e on e.id = d.event_id
           where d.id = division_id
             and d.allow_free_agents = true
             and e.type = 'tournament'
             and e.status = 'published'
        )
      )
    )
  );

-- Self-update is rare but the old policy allowed it for pending attendee
-- rows (e.g. cancelling before pay). Preserve that branch.
create policy event_participants_update_own_pending on public.event_participants
  for update
  using (
    auth.uid() = user_id
    and role = 'attendee'
    and exists (
      select 1 from public.event_participant_payments pp
       where pp.participant_id = id and pp.payment_status = 'pending'
    )
  )
  with check (
    auth.uid() = user_id
    and role = 'attendee'
  );

-- Host can update any participant row on their event.
create policy event_participants_update_host on public.event_participants
  for update
  using (
    exists (
      select 1 from public.event_divisions d
       where d.id = division_id and public.is_event_host(d.event_id)
    )
  )
  with check (
    exists (
      select 1 from public.event_divisions d
       where d.id = division_id and public.is_event_host(d.event_id)
    )
  );

-- Delete: own row OR host of the event.
create policy event_participants_delete on public.event_participants
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.event_divisions d
       where d.id = division_id and public.is_event_host(d.event_id)
    )
  );

-- Payments table: select for participant owner or host; insert/update for
-- the same. Webhook flows continue to use the admin client and bypass RLS.
create policy event_participant_payments_select on public.event_participant_payments
  for select using (
    exists (
      select 1 from public.event_participants p
       where p.id = participant_id
         and (
           p.user_id = auth.uid()
           or exists (
             select 1 from public.event_divisions d
              where d.id = p.division_id and public.is_event_host(d.event_id)
           )
         )
    )
  );

create policy event_participant_payments_insert on public.event_participant_payments
  for insert with check (
    exists (
      select 1 from public.event_participants p
       where p.id = participant_id
         and (
           p.user_id = auth.uid()
           or exists (
             select 1 from public.event_divisions d
              where d.id = p.division_id and public.is_event_host(d.event_id)
           )
         )
    )
  );

create policy event_participant_payments_update_own_pending
  on public.event_participant_payments
  for update
  using (
    payment_status = 'pending'
    and exists (
      select 1 from public.event_participants p
       where p.id = participant_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.event_participants p
       where p.id = participant_id and p.user_id = auth.uid()
    )
  );

create policy event_participant_payments_update_host
  on public.event_participant_payments
  for update
  using (
    exists (
      select 1 from public.event_participants p
        join public.event_divisions d on d.id = p.division_id
       where p.id = participant_id and public.is_event_host(d.event_id)
    )
  )
  with check (
    exists (
      select 1 from public.event_participants p
        join public.event_divisions d on d.id = p.division_id
       where p.id = participant_id and public.is_event_host(d.event_id)
    )
  );

create policy event_participant_payments_delete on public.event_participant_payments
  for delete using (
    exists (
      select 1 from public.event_participants p
       where p.id = participant_id
         and (
           p.user_id = auth.uid()
           or exists (
             select 1 from public.event_divisions d
              where d.id = p.division_id and public.is_event_host(d.event_id)
           )
         )
    )
  );

-- ---- 8. Rewrite enforce_event_capacity to fire on event_participants -----
--
-- Counts event_participants WHERE role='attendee' for the event (across
-- all divisions, matching the prior behaviour: the primary division's
-- max_spots caps the event's total attendee count regardless of which
-- division the new row lands in).

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
      from public.event_participants p
      join public.event_divisions d on d.id = p.division_id
     where d.event_id = v_event_id and p.role = 'attendee';
    if current_count >= primary_max_spots then
      raise exception 'Event % is full', v_event_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_event_capacity
  before insert on public.event_participants
  for each row when (new.role = 'attendee')
  execute function public.enforce_event_capacity();

-- ---- 9. Rewrite event_paid_attendee_count --------------------------------

create or replace function public.event_paid_attendee_count(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.event_participants p
    join public.event_divisions d on d.id = p.division_id
    join public.event_participant_payments pay on pay.participant_id = p.id
   where d.event_id = p_event_id
     and p.role = 'attendee'
     and pay.payment_status = 'paid'
$$;
grant execute on function public.event_paid_attendee_count(uuid) to anon, authenticated;

-- ---- 10. Recreate events_select policy (friends_of_attendees branch) -----
--
-- Verbatim copy of the policy from 20260730000000_drop_event_id_pk_reshape.sql
-- with the friends_of_attendees subquery retargeted at event_participants.

create policy events_select on public.events for select using (
  status = 'published'
  and deleted_at is null
  and (
    visibility = 'public'
    or (
      visibility = 'unlisted' and auth.role() is not null
    )
    or (
      visibility = 'invite_only' and (
        host_id = auth.uid()
        or exists (
          select 1 from public.event_co_hosts c
           where c.event_id = events.id and c.user_id = auth.uid()
        )
        or exists (
          select 1 from public.event_invites i
           where i.event_id = events.id
             and i.invitee_user_id = auth.uid()
             and i.status in ('pending','accepted')
        )
      )
    )
    or (
      visibility = 'group' and host_group_id is not null and exists (
        select 1 from public.group_members gm
         where gm.group_id = host_group_id and gm.user_id = auth.uid()
      )
    )
    or (
      visibility = 'friends_only' and exists (
        select 1 from public.friendships f
         where f.user_id = host_id and f.friend_id = auth.uid()
      )
    )
    or (
      visibility = 'friends_of_attendees' and exists (
        select 1
          from public.event_participants p
          join public.event_divisions d on d.id = p.division_id
          join public.friendships f
            on f.user_id = p.user_id and f.friend_id = auth.uid()
         where d.event_id = events.id and p.role = 'attendee'
      )
    )
  )
);

-- ---- 11. Rebuild dependent views -----------------------------------------

create view public.events_view as
select
  e.*,
  st_x(e.geo::geometry) as longitude,
  st_y(e.geo::geometry) as latitude,
  (select count(*)
     from public.event_participants p
     join public.event_divisions d on d.id = p.division_id
    where d.event_id = e.id and p.role = 'attendee')::int as attendee_count,
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
                select sum(pay.amount_paid_cents)
                  from public.event_participants p
                  join public.event_divisions d on d.id = p.division_id
                  join public.event_participant_payments pay on pay.participant_id = p.id
                 where d.event_id = e.id and p.role = 'attendee' and pay.payment_status = 'paid'
            ),
            0
        )
        + coalesce(
            (
                select sum(tp.amount_paid_cents)
                  from public.event_team_payments tp
                  join public.event_team_entries en on en.id = tp.entry_id
                  join public.event_divisions d on d.id = en.division_id
                 where d.event_id = e.id and tp.payment_status = 'paid'
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
              from public.event_participants p
              join public.event_divisions d on d.id = p.division_id
             where d.event_id = e.id and p.role = 'attendee'
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
                      from public.event_participants p
                      join public.event_divisions d on d.id = p.division_id
                      left join public.event_participant_payments pay on pay.participant_id = p.id
                     where d.event_id = e.id
                       and p.role = 'attendee'
                       and coalesce(pay.payment_status, 'pending') in ('none', 'paid')
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
                    select sum(pay.amount_paid_cents)
                      from public.event_participants p
                      join public.event_divisions d on d.id = p.division_id
                      join public.event_participant_payments pay on pay.participant_id = p.id
                     where d.event_id = e.id and p.role = 'attendee' and pay.payment_status = 'paid'
                ),
                0
            )
            + coalesce(
                (
                    select sum(tp.amount_paid_cents)
                      from public.event_team_payments tp
                      join public.event_team_entries en on en.id = tp.entry_id
                      join public.event_divisions d on d.id = en.division_id
                     where d.event_id = e.id and tp.payment_status = 'paid'
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
                      from public.event_participants p
                      join public.event_divisions d on d.id = p.division_id
                      left join public.event_participant_payments pay on pay.participant_id = p.id
                     where d.event_id = e.id
                       and p.role = 'attendee'
                       and coalesce(pay.payment_status, 'pending') in ('none', 'paid')
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

-- ---- 12. Realtime publication --------------------------------------------
alter publication supabase_realtime add table public.event_participants;
