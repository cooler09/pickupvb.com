-- ============================================================================
-- Walk-in team registrations — first-class source on event_team_registrations.
-- See docs/adr/0017-walk-in-registrations.md
--
-- Context: registration-workflow audit finding R4 (Bundle 117, 2026-05-27)
-- recorded that walk-ins — teams that show up on tournament day without a
-- captain account and pay cash at the table — were not modeled. The two
-- existing paths (captain self-signup and host-proxy) both required a real
-- captain identity, so host-proxy "walk-ins" persisted the host's user id
-- on captain_id and showed the host as the captain on the public roster.
-- ADR 0017 settles the data shape; this migration applies it.
--
-- Impact:
--   1. event_team_registrations.captain_id becomes NULLABLE (was NOT NULL).
--      Reads that resolve "Captain: X" must fall back to the new
--      captain_display_name column when captain_id is null.
--   2. New columns:
--        source text not null default 'captain'  (enum: captain | host | walk_in)
--        captain_display_name text                (required when source = walk_in)
--        captain_phone text                       (optional contact for walk-ins)
--        payment_note text                        (freeform cash-payment note)
--      All defaulted/nullable — existing rows transparently become
--      source = 'captain' with the freeform fields null.
--   3. Check constraint enforces the discriminant:
--        walk_in  → captain_id null AND captain_display_name not null
--        captain/host → captain_id not null
--      Backfill is a no-op (all existing rows are 'captain' with captain_id set).
--   4. RLS event_team_registrations_insert is rewritten to permit two branches:
--        (a) captain self-signup (unchanged: auth.uid() = captain_id) for
--            source = 'captain' in a published ad_hoc division;
--        (b) host inserts for source in ('host', 'walk_in') when auth.uid()
--            is the event's host on a published ad_hoc division.
--      The existing host-proxy path uses the admin client and so bypasses
--      RLS, but the policy must still be correct so a future flip to a
--      user-context client doesn't regress. Co-host inserts continue to
--      route through the admin path; the RLS branch covers the host only
--      to keep the policy compact.
--   5. Walk-ins do NOT create event_team_payments rows. Payment is
--      recorded via the existing host action that flips payment_status
--      to 'paid' with a synthetic offline:host:<uuid> payment_intent_id
--      (already in place per the 2026-05-22 remediation log). The new
--      payment_note column lets the host record reconciliation context.
-- ============================================================================

-- ---- 1. Make captain_id nullable -------------------------------------------
alter table public.event_team_registrations
  alter column captain_id drop not null;

-- ---- 2. Add walk-in columns ------------------------------------------------
alter table public.event_team_registrations
  add column source text not null default 'captain'
    check (source in ('captain', 'host', 'walk_in')),
  add column captain_display_name text
    check (captain_display_name is null
           or (char_length(btrim(captain_display_name)) between 1 and 80)),
  add column captain_phone text
    check (captain_phone is null
           or (char_length(btrim(captain_phone)) between 1 and 40)),
  add column payment_note text
    check (payment_note is null
           or char_length(payment_note) <= 500);

-- ---- 3. Discriminant check -------------------------------------------------
-- walk_in: captain_id must be NULL and captain_display_name must be set.
-- captain/host: captain_id must be NOT NULL (captain_display_name optional).
alter table public.event_team_registrations
  add constraint event_team_registrations_source_identity_chk
  check (
    (source = 'walk_in'
       and captain_id is null
       and captain_display_name is not null)
    or
    (source in ('captain', 'host')
       and captain_id is not null)
  );

-- ---- 4. Index for source filtering (host panel filters by 'walk_in') -------
create index if not exists event_team_registrations_source_idx
  on public.event_team_registrations (event_id, source);

-- ---- 5. Rewrite the insert RLS policy --------------------------------------
-- Bundle 119 (ADR 0016) made this policy join event_divisions to gate on
-- the per-division mode. We keep that gate and split the captain branch
-- from the host branch on `source`.
drop policy if exists event_team_registrations_insert on public.event_team_registrations;
create policy event_team_registrations_insert
  on public.event_team_registrations for insert with check (
    -- (a) Captain self-signup — unchanged from Bundle 119.
    (
      source = 'captain'
      and auth.uid() = captain_id
      and exists (
        select 1
          from public.events e
          join public.event_divisions d on d.event_id = e.id
         where e.id = event_id
           and d.id = division_id
           and e.status = 'published'
           and d.team_registration_mode = 'ad_hoc'
      )
    )
    or
    -- (b) Host insert — for source in ('host','walk_in') on an ad_hoc
    --     division, when auth.uid() is the event host. Co-host inserts
    --     continue to route through the admin client (which bypasses RLS
    --     entirely); covering them here would require joining
    --     event_co_hosts and group_members, which we defer.
    (
      source in ('host', 'walk_in')
      and exists (
        select 1
          from public.events e
          join public.event_divisions d on d.event_id = e.id
         where e.id = event_id
           and d.id = division_id
           and e.status = 'published'
           and d.team_registration_mode = 'ad_hoc'
           and e.host_id = auth.uid()
      )
    )
  );
