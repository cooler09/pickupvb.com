-- =============================================================================
-- Events: off-platform payments flag
-- =============================================================================
-- Lets a host display a non-zero entry price (per-event or per-division) while
-- collecting payment outside the platform (cash at the door, Venmo, etc.).
-- When true, the host does NOT need a Stripe Connect account and the platform
-- skips Checkout entirely; players still RSVP on-platform.
--
-- Defaults to false so all existing rows continue to gate paid events behind
-- Stripe Connect (current behavior).
-- =============================================================================

alter table public.events
  add column if not exists payments_off_platform boolean not null default false;

comment on column public.events.payments_off_platform is
  'When true, the host collects entry payment off-platform; Stripe gating is skipped and players RSVP without Checkout. Defaults to false.';
