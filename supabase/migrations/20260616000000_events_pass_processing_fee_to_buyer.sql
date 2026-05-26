-- ============================================================================
-- Events: pass_processing_fee_to_buyer flag — host-trust monetization lever.
--
-- Context: Bundle 83 (Monetization audit P1 #2). Today the Stripe processing
-- fee (~2.9% + $0.30 — about $0.91 on a $20 ticket) comes off the host's
-- payout silently in buyer-paid mode. Hosts see "$20 ticket, $19.09 received"
-- on their first payout and read it as a hidden tax. Eventbrite, ClubExpress
-- and every other ticketing platform pass the processing fee to the buyer as
-- a separate line item — this column lets us do the same per-event.
--
-- Impact:
--   * **New column** `events.pass_processing_fee_to_buyer boolean`. Default
--     `true` so any event created going forward gets the new (host-friendly)
--     behavior; existing rows backfill to `false` to preserve their
--     advertised totals on attendee-facing surfaces. The edit form picks the
--     flag up so hosts can opt in.
--   * Application-layer change in the same bundle: `attendeeChargeBreakdownAsync`
--     emits a third line item "Processing fee" when the flag is on AND
--     `host_absorbs_fee` is off (host-absorbs mode means the host is
--     advertising "what you see is what you pay" — adding a processing fee
--     line would contradict that). Per-team checkout flows mirror the same
--     rule.
--   * No app-fee math change for PickupVB: `application_fee_amount` stays
--     at the platform-fee bps applied to ticket subtotal. Processing fee
--     line item is routed to the host's connected account; Stripe's actual
--     processing fee continues to net against the host's balance, just on
--     a higher gross.
--   * Refund asymmetry stays unchanged: Stripe doesn't return the
--     processing fee on a refund regardless of who paid it (existing
--     behavior). Documented in docs/payments.md.
-- ============================================================================

alter table public.events
  add column if not exists pass_processing_fee_to_buyer boolean not null default true;

comment on column public.events.pass_processing_fee_to_buyer is
  'When true (default for new events), Stripe Checkout adds a separate "Processing fee" line so the host receives the advertised ticket price net of platform fees. When false (legacy default), the processing fee comes off the host''s payout. Ignored when host_absorbs_fee=true.';

-- Backfill existing rows to `false` so their advertised totals don''t shift
-- under buyers who already see them. New rows default `true` via the
-- column DEFAULT above.
update public.events
  set pass_processing_fee_to_buyer = false
  where created_at < now();
