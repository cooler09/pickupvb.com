-- ============================================================================
-- ADR 0007 — Roster-mode per-team captain checkout (sidecar payment table).
--
-- The `event_team_registrations` table tracks ad-hoc team signup state
-- (captain assembled a roster at signup time). Persistent teams (roster
-- mode) register through `event_teams` instead. Until now that path had
-- no payment record — captains on per_team-priced, on-platform divisions
-- could register but the platform never charged them.
--
-- Bundle 3 (validation) blocks NEW events from being saved with the
-- misconfigured combination `(team-led + per_player + on-platform)`. This
-- migration adds the missing money path for the supported combination:
-- `(roster + per_team + on-platform)`.
--
-- Modeling choice (see journal 2026-05-22-bundle-3.md, Decision 3):
-- sidecar table referencing `event_teams` by composite FK rather than
-- adding payment columns to `event_teams` directly. Keeps the
-- registration row clean for non-paid contexts (off-platform events,
-- per_player divisions, free divisions) and lets payments have their own
-- lifecycle (refunds, disputes) without rewriting the registration shape.
-- ============================================================================

create table public.event_team_payments (
  id                  uuid primary key default uuid_generate_v4(),
  event_id            uuid not null,
  team_id             uuid not null,
  captain_id          uuid not null references public.profiles(id) on delete cascade,

  -- Mirrors event_team_registrations.payment_status. Roster captains
  -- transition None → Pending (on checkout start) → Paid (webhook) or
  -- back to None (expiry / cancel). Refunded is terminal.
  payment_status      text not null default 'none'
                      check (payment_status in ('none', 'pending', 'paid', 'refunded')),
  checkout_session_id text,
  payment_intent_id   text,
  amount_paid_cents   integer check (amount_paid_cents is null or amount_paid_cents >= 0),
  paid_at             timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- One payment row per registered team. If the team is withdrawn (row
  -- deleted from event_teams) the composite FK cascades the cleanup.
  constraint event_team_payments_event_team_unique unique (event_id, team_id),
  constraint event_team_payments_event_team_fk
    foreign key (event_id, team_id)
    references public.event_teams (event_id, team_id)
    on delete cascade
);

create index event_team_payments_event_idx
  on public.event_team_payments (event_id);
create index event_team_payments_captain_idx
  on public.event_team_payments (captain_id);
create index event_team_payments_session_idx
  on public.event_team_payments (checkout_session_id)
  where checkout_session_id is not null;
create index event_team_payments_pi_idx
  on public.event_team_payments (payment_intent_id)
  where payment_intent_id is not null;

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

-- ---- RLS -----------------------------------------------------------------
alter table public.event_team_payments enable row level security;

-- Read: anyone can see (matches event_team_registrations). UI gates the
-- "Pay" button to the captain; viewers see paid/unpaid state implicitly.
create policy event_team_payments_select
  on public.event_team_payments for select using (true);

-- Insert: captain themself (matches event_team_registrations RLS shape).
-- Service role bypasses RLS so the server action / webhook can write
-- regardless.
create policy event_team_payments_insert
  on public.event_team_payments for insert with check (
    auth.uid() = captain_id
    and exists (
      select 1 from public.event_teams et
       where et.event_id = event_id and et.team_id = team_id
    )
    and exists (
      select 1 from public.events e
       where e.id = event_id
         and e.status = 'published'
         and e.team_registration_mode = 'roster'
    )
  );

-- Update: captain or host. Most writes go through the service role
-- (webhook + server action) which bypasses RLS — this policy exists for
-- defensive completeness only.
create policy event_team_payments_update
  on public.event_team_payments for update using (
    auth.uid() = captain_id
    or exists (
      select 1 from public.events e
       where e.id = event_id and e.host_id = auth.uid()
    )
  );

create policy event_team_payments_delete
  on public.event_team_payments for delete using (
    auth.uid() = captain_id
    or exists (
      select 1 from public.events e
       where e.id = event_id and e.host_id = auth.uid()
    )
  );

alter publication supabase_realtime add table public.event_team_payments;
