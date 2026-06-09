-- ============================================================================
-- Sponsor slot: decouple entitlement from content (monetization audit SP-1/SP-2)
-- See docs/audits/monetization.md § "Sponsor slot focused audit".
--
-- Context: the sponsor slot (20260617/20260618) stored BOTH the sponsor content
-- (name/blurb/link/logo/discount) AND the à-la-carte entitlement
-- (access_kind/paid_at/purchased_by/stripe ids) on a single `event_sponsors`
-- row. That coupling caused two bugs:
--   - SP-1: `removeSponsor` DELETEs the whole row, so a free host who paid $3 to
--     unlock the slot LOSES the entitlement and is charged again on re-add.
--   - SP-2: the authoring gate ("Pro OR paid") was also applied to removal, so a
--     host who created a sponsor while Pro and then let Pro lapse could no longer
--     remove their own sponsor.
-- Badges already solved this (20260907000000_event_badge_access.sql): the
-- *capability* unlock lives in its own per-event table, decoupled from the
-- multi-row `event_badges` content. This migration brings the sponsor slot to
-- the same shape — `event_sponsor_access` (entitlement) + `event_sponsors`
-- (content only).
--
-- Impact:
--   - New table `event_sponsor_access` (one row per event), mirroring
--     `event_badge_access`: RLS on, NO client policies — written only by the
--     `sponsor_slot` Stripe webhook (service role) and read via the admin client
--     by the edit page / action gate (AGENTS pitfall #8 — session-less mirror).
--   - Existing à-la-carte entitlements are backfilled from `event_sponsors`
--     (rows where access_kind = 'ala_carte' AND paid_at IS NOT NULL) BEFORE the
--     columns are dropped, so no paid unlock is lost. Pro-authored rows carried
--     access_kind = 'pro' with paid_at NULL — that entitlement is re-derived from
--     `hasProBenefits(host)` at runtime, never stored, so dropping it loses
--     nothing.
--   - `event_sponsors` then drops its 5 entitlement columns (access_kind,
--     purchased_by_user_id, stripe_checkout_session_id, stripe_payment_intent_id,
--     paid_at). Dropping the columns also drops the dependent
--     `event_sponsors_access_kind_check` constraint and the
--     `event_sponsors_payment_intent_idx` partial index automatically.
--   - App-layer change lands in the same PR: the entitlement read moves to
--     `event_sponsor_access`, the webhook writes the access row + the content
--     row separately, and `removeSponsor` deletes only the content row (the
--     access row survives so a re-add is free).
-- ============================================================================

-- ---- entitlement table (mirror event_badge_access) -------------------------
create table public.event_sponsor_access (
  event_id                    uuid primary key references public.events(id) on delete cascade,
  access_kind                 text not null default 'ala_carte' check (access_kind in ('ala_carte')),
  purchased_by_user_id        uuid references public.profiles(id) on delete set null,
  stripe_checkout_session_id  text,
  stripe_payment_intent_id    text,
  paid_at                     timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.event_sponsor_access is
  'Per-event à-la-carte unlock of the host sponsor slot. Written by the sponsor_slot Stripe webhook; the Pro gate is "hasProBenefits OR paid_at is not null". Decoupled from event_sponsors content (monetization audit SP-1/SP-2) so removing a sponsor keeps the paid entitlement. Mirrors event_badge_access.';

create or replace function public.touch_event_sponsor_access_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_event_sponsor_access_touch
  before update on public.event_sponsor_access
  for each row execute function public.touch_event_sponsor_access_updated_at();

-- RLS on, no client policies: reads happen on the admin client (edit page /
-- action gate), writes happen on the service-role webhook. RLS-bypassing admin
-- is the only intended accessor (AGENTS pitfall #8 — session-less Stripe mirror).
alter table public.event_sponsor_access enable row level security;

-- ---- backfill existing paid à-la-carte entitlements ------------------------
-- Must run BEFORE the columns are dropped. Pro-authored rows (access_kind='pro',
-- paid_at NULL) are intentionally excluded — Pro entitlement is re-derived live.
insert into public.event_sponsor_access (
  event_id, access_kind, purchased_by_user_id,
  stripe_checkout_session_id, stripe_payment_intent_id, paid_at, created_at
)
select
  s.event_id,
  'ala_carte',
  s.purchased_by_user_id,
  s.stripe_checkout_session_id,
  s.stripe_payment_intent_id,
  s.paid_at,
  s.created_at
from public.event_sponsors s
where s.access_kind = 'ala_carte'
  and s.paid_at is not null
on conflict (event_id) do nothing;

-- ---- drop entitlement columns from the content table -----------------------
-- DROP COLUMN cascades to the access_kind CHECK constraint and the
-- payment-intent partial index, which reference only these columns.
alter table public.event_sponsors
  drop column if exists access_kind,
  drop column if exists purchased_by_user_id,
  drop column if exists stripe_checkout_session_id,
  drop column if exists stripe_payment_intent_id,
  drop column if exists paid_at;
