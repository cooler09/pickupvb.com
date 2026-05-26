-- ============================================================================
-- Event sponsors: a-la-carte checkout metadata (Bundle 85)
--
-- Context: Bundle 84 shipped host-owned sponsor slots as Pro-only
-- authoring. Monetization audit P2 #4 explicitly left the free-tier
-- a-la-carte path as a follow-up bundle. Bundle 85 adds the minimum
-- schema needed to record that a sponsor slot was unlocked via a
-- one-time payment (instead of Pro entitlement) and to trace Stripe
-- payment artifacts for reconciliation.
--
-- Impact:
--   - `event_sponsors` gains entitlement/payment columns:
--       * access_kind ('pro' | 'ala_carte')
--       * purchased_by_user_id
--       * stripe_checkout_session_id
--       * stripe_payment_intent_id
--       * paid_at
--   - Existing rows backfill to `access_kind = 'pro'`.
--   - No behavior changes for existing Pro-authored sponsor rows.
--   - Application/webhook code can now distinguish Pro access vs
--     paid one-off unlock and safely persist payment provenance.
-- ============================================================================

alter table public.event_sponsors
  add column if not exists access_kind text,
  add column if not exists purchased_by_user_id uuid,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists paid_at timestamptz;

update public.event_sponsors
set access_kind = 'pro'
where access_kind is null;

alter table public.event_sponsors
  alter column access_kind set default 'pro',
  alter column access_kind set not null;

alter table public.event_sponsors
  add constraint event_sponsors_access_kind_check
  check (access_kind in ('pro', 'ala_carte'));

comment on column public.event_sponsors.access_kind is
  'How this sponsor slot is entitled: pro subscription or one-off a-la-carte payment.';
comment on column public.event_sponsors.purchased_by_user_id is
  'User who paid for the a-la-carte sponsor unlock. Null for Pro-entitled rows.';
comment on column public.event_sponsors.stripe_checkout_session_id is
  'Stripe Checkout session id for a-la-carte sponsor unlock.';
comment on column public.event_sponsors.stripe_payment_intent_id is
  'Stripe PaymentIntent id for a-la-carte sponsor unlock.';
comment on column public.event_sponsors.paid_at is
  'Timestamp the a-la-carte sponsor unlock payment was confirmed.';

create index if not exists event_sponsors_payment_intent_idx
  on public.event_sponsors (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
