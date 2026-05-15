-- ============================================================================
-- Stripe Connect foundation
-- ----------------------------------------------------------------------------
-- Tables that back paid events and the host-payout flow. This migration is
-- additive only — no existing tables are touched, no data flow changes. Until
-- the application actually creates Stripe Checkout sessions, these tables
-- stay empty.
--
--   public.host_stripe_accounts
--     One row per host that has started Stripe Connect onboarding. Holds the
--     `stripe_account_id` plus a flat copy of the capabilities flags so we
--     don't need a Stripe API call on every event-edit page load. The webhook
--     handler keeps these flags fresh via `account.updated` events.
--
--   public.stripe_webhook_events
--     Idempotency log. Stripe may deliver the same event multiple times. We
--     INSERT the event id at the start of processing; if the row already
--     exists (unique violation) we ack the webhook and skip the side effects.
--
-- Both tables are SERVER-ONLY: RLS denies all access to anon and authed
-- roles. Reads/writes happen via the service-role key inside trusted server
-- code (webhook handler + onboarding actions).
-- ============================================================================

create table public.host_stripe_accounts (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  stripe_account_id  text not null unique,
  -- Mirrored from Stripe `account.updated`. Keep `false` until the host
  -- finishes onboarding, then we'll allow them to publish paid events.
  charges_enabled    boolean not null default false,
  payouts_enabled    boolean not null default false,
  details_submitted  boolean not null default false,
  -- Last raw payload from Stripe — useful for debugging onboarding stalls.
  last_event_payload jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index host_stripe_accounts_account_idx
  on public.host_stripe_accounts (stripe_account_id);

create or replace function public.host_stripe_accounts_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_host_stripe_accounts_touch_updated
  before update on public.host_stripe_accounts
  for each row execute function public.host_stripe_accounts_touch_updated();

alter table public.host_stripe_accounts enable row level security;
-- No policies on purpose: only the service role (webhook handler, server
-- actions) reads/writes this table. Hosts see their status through a server
-- action that returns a sanitized DTO.

-- ----------------------------------------------------------------------------
-- Webhook idempotency log
-- ----------------------------------------------------------------------------

create table public.stripe_webhook_events (
  -- Stripe's `evt_...` id. Primary key gives us idempotency for free: a
  -- duplicate delivery hits a unique-violation and we short-circuit.
  id           text primary key,
  event_type   text not null,
  -- We don't store the full payload (large + may contain PII). We trust the
  -- signature-verified payload at handle-time and just record that we've
  -- seen this id.
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

create index stripe_webhook_events_type_idx
  on public.stripe_webhook_events (event_type, received_at desc);

alter table public.stripe_webhook_events enable row level security;
-- Service-role only.
