-- ============================================================================
-- Gamification — free-tier à-la-carte unlock for host event badges.
-- See docs/adr/0031-gamification-badges.md
--
-- Context: host collectible badges (20260903000000) are a Pro capability. This
-- mirrors the sponsor slot's à-la-carte path (20260817/20260818): a free host can
-- pay a one-time fee to unlock badge authoring for a single event. Unlike the
-- sponsor slot (one row per event holding both the content and the access flag),
-- badges are multi-row, so the *capability* unlock lives in its own per-event
-- table; the badges themselves stay in `event_badges`.
--
-- Impact: additive. New table `event_badge_access` (one row per event). Written
-- only by the Stripe webhook on `badge_slot` checkout completion (service role);
-- there are no client-facing policies (the edit page reads it via the admin
-- client, like the sponsor access read). The Pro gate in the app layer becomes
-- "hasProBenefits(host) OR a paid badge-access row exists". No existing
-- reads/writes change.
-- ============================================================================

create table public.event_badge_access (
  event_id                    uuid primary key references public.events(id) on delete cascade,
  access_kind                 text not null default 'ala_carte' check (access_kind in ('ala_carte')),
  purchased_by_user_id        uuid references public.profiles(id) on delete set null,
  stripe_checkout_session_id  text,
  stripe_payment_intent_id    text,
  paid_at                     timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.event_badge_access is
  'Per-event à-la-carte unlock of host collectible badges (gamification). Written by the badge_slot Stripe webhook; the Pro gate is "hasProBenefits OR paid_at is not null". Mirrors the sponsor slot ala_carte path.';

create or replace function public.touch_event_badge_access_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_event_badge_access_touch
  before update on public.event_badge_access
  for each row execute function public.touch_event_badge_access_updated_at();

-- RLS on, no client policies: reads happen on the admin client (edit page /
-- action gate), writes happen on the service-role webhook. RLS-bypassing admin
-- is the only intended accessor (AGENTS pitfall #8 — session-less Stripe mirror).
alter table public.event_badge_access enable row level security;
