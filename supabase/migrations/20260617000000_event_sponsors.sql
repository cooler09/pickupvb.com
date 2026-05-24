-- ============================================================================
-- Event sponsors — host-owned sponsor slot v1 (Bundle 84)
-- See docs/audits/monetization.md §4 ("Host-owned sponsor slot").
--
-- Context: PickupVB's answer to "should we add sponsor spots?" is
-- explicitly **not** to become an ad network. Instead, each event gets
-- one optional host-defined sponsor block (logo, one-line blurb,
-- link, optional discount code). The host owns the relationship to
-- the sponsor (their local sporting-goods store, brewery, PT, etc.)
-- and PickupVB monetizes the *capability* by gating sponsor authoring
-- behind Pro (per the audit's "Pro = host operating system" framing).
-- This is the first true net-new Pro feature — every prior Pro perk
-- was a discount on existing free-tier behavior.
--
-- Impact:
--   - New table `event_sponsors` (one row per event — uniqueness on
--     event_id, not (event_id, name) — v1 is single-slot).
--   - RLS reads are public (sponsor block renders on the event page
--     to anyone who can see the event), writes are restricted to the
--     event manager (host_id OR primary-group owner/admin OR co-host).
--   - The Pro gate lives in the application layer (server actions),
--     not in RLS — RLS authorizes "can manage this event", Pro
--     authorizes "is allowed to create a sponsor row at all". Keeping
--     them separate means downgrades and admin overrides don't
--     require schema changes, and the gate can move (Free à-la-carte
--     in a future bundle) without a migration.
--   - URL columns are validated as https:// so we don't render mixed
--     content from a copy-paste mistake.
--   - No charging logic in this migration. Pro-only v1 is the
--     audit's chosen shape; à-la-carte is a deferred follow-up.
-- ============================================================================

create table public.event_sponsors (
  id              uuid primary key default uuid_generate_v4(),
  event_id        uuid not null unique references public.events(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 80),
  blurb           text check (blurb is null or length(blurb) <= 140),
  link_url        text check (link_url is null or link_url ~* '^https://'),
  logo_url        text check (logo_url is null or logo_url ~* '^https://'),
  discount_code   text check (discount_code is null or length(btrim(discount_code)) between 1 and 32),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.event_sponsors is
  'Host-owned sponsor slot per event (Bundle 84, audits/monetization.md §4). One row per event. Authoring is gated to Pro hosts in the application layer; RLS only enforces "can manage this event".';

create index event_sponsors_event_idx on public.event_sponsors (event_id);

-- ---- updated_at trigger ----------------------------------------------------
create or replace function public.touch_event_sponsors_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_event_sponsors_touch
  before update on public.event_sponsors
  for each row execute function public.touch_event_sponsors_updated_at();

-- ---- RLS -------------------------------------------------------------------
alter table public.event_sponsors enable row level security;

-- Select: public — rendering the sponsor block on the event page must
-- work for anon visitors viewing a public event. Visibility of the
-- sponsor block follows the visibility of the event itself: if the
-- viewer can't read the event row, they can't reach this page, so a
-- permissive SELECT here is safe.
create policy event_sponsors_select on public.event_sponsors for select
  using (true);

-- Manage (insert/update/delete): event manager set — host_id of the
-- event, owner/admin of the event's primary host group, or a co-host
-- (user or group-admin of a co-host group). Same shape as
-- event_guests_delete / event_team_payments management policies.
create policy event_sponsors_insert on public.event_sponsors for insert
  with check (
    exists (
      select 1 from public.events e
       where e.id = event_sponsors.event_id
         and (
           e.host_id = auth.uid()
           or (e.host_group_id is not null and exists (
             select 1 from public.group_members gm
              where gm.group_id = e.host_group_id
                and gm.user_id  = auth.uid()
                and gm.role in ('owner', 'admin')
           ))
         )
    )
    or exists (
      select 1 from public.event_co_hosts ch
       where ch.event_id = event_sponsors.event_id
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
  );

create policy event_sponsors_update on public.event_sponsors for update
  using (
    exists (
      select 1 from public.events e
       where e.id = event_sponsors.event_id
         and (
           e.host_id = auth.uid()
           or (e.host_group_id is not null and exists (
             select 1 from public.group_members gm
              where gm.group_id = e.host_group_id
                and gm.user_id  = auth.uid()
                and gm.role in ('owner', 'admin')
           ))
         )
    )
    or exists (
      select 1 from public.event_co_hosts ch
       where ch.event_id = event_sponsors.event_id
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
  );

create policy event_sponsors_delete on public.event_sponsors for delete
  using (
    exists (
      select 1 from public.events e
       where e.id = event_sponsors.event_id
         and (
           e.host_id = auth.uid()
           or (e.host_group_id is not null and exists (
             select 1 from public.group_members gm
              where gm.group_id = e.host_group_id
                and gm.user_id  = auth.uid()
                and gm.role in ('owner', 'admin')
           ))
         )
    )
    or exists (
      select 1 from public.event_co_hosts ch
       where ch.event_id = event_sponsors.event_id
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
  );
