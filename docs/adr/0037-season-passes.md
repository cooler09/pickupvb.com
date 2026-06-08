# 0037. Season passes / multi-session punch cards

- **Status:** Accepted
- **Date:** 2026-06-08

## Context

[Monetization audit O-1](../audits/monetization.md) identified a host-priced
**bundle** — "10-session open-play pass," "season pass," "punch card" — as the
strongest unbuilt monetization surface that _creates value rather than extracting
it_:

- **Attendee** wins: a lower per-session price and one payment instead of
  chasing a per-event charge (or Venmo) every week.
- **Host** wins: committed revenue up front and far less weekly payment admin —
  the exact pain the off-platform upsell (Bundle 100) already targets.
- **Platform** wins: the normal ticket take-rate on a larger up-front
  transaction (no new fee), and it pulls Venmo-driven recurring hosts onto
  on-platform payments.

This ADR records the v1 design. The four product forks were confirmed with the
maintainer (2026-06-08): **host-wide opt-in eligibility**, **Pro-only selling**,
**host-set expiry with non-refundable unused credits**, and **redemption at
sign-up** (there is no host check-in flow to hang redemption on, so the
reservation path is the only sensible point).

## Decision

### A pass is a host-level prepaid credit pack, redeemed at sign-up

1. A **Pro host** defines a `host_pass` product: a title, a credit count (N
   sessions), a price, and an optional expiry-in-days. Selling passes is a
   **Pro-only** capability — a net-new host tool (no clawback of any free
   feature), aimed squarely at the serial recurring-open-play host Pro is built
   for ([ADR 0014](0014-monetization-strategy.md)). **Buying** a pass needs no
   Pro.
2. A buyer purchases a pass through **Stripe Checkout as a destination charge to
   the host** — identical routing to a ticket: `events.host_id`'s Connect
   account, platform fee at the host's tier (5% Free / 2.5% Pro via
   `platformFeeCentsFor`). A pass purchase **is host payout income** (unlike the
   platform-direct sponsor/badge unlocks — see [payments.md](../payments.md)).
   **v1 does not write pass purchases into the `event_payment_audit` ledger.**
   That table's `event_id` is `NOT NULL` and a pass isn't tied to one event;
   making it nullable would be invasive surgery on the freshly-audited
   receipts/earnings surface (see [receipts-tax.md](../audits/receipts-tax.md)).
   Instead, the host sees pass revenue (sum of paid purchases) on the
   **pass-management page**, and the buyer gets Stripe's emailed receipt from the
   host's account. Folding pass income into the global earnings page + tax CSV is
   an explicit v1 follow-up, to be coordinated with the receipts-tax audit.
3. The host **opts an event in** to accepting pass credits via a new
   `events.accepts_pass_credits` flag (open-play only in v1). A credit from a
   purchase is redeemable on **any** of that host's open-play events flagged
   `accepts_pass_credits` — a true membership/punch-card, not a single-series
   pass.
4. **Redemption = claiming a reserved spot with a prepaid credit.** The buyer
   hits "Use a pass credit" on an eligible event; an atomic
   `redeem_pass_credit` RPC reserves their `event_participants` row (the
   capacity trigger still fires) and writes a `paid` `event_participant_payments`
   row with `amount_paid_cents = 0` and `pass_purchase_id` set — **no Stripe
   charge** (the money was collected at pass purchase). The participant then
   looks and behaves exactly like a paid attendee everywhere else.
5. **Credits return on cancel.** Leaving/cancelling a pass-redeemed spot deletes
   the participant; the linked payment row cascades away, so
   `credits_remaining = credits_total − count(live redemptions)` self-corrects
   and the credit is returned to the buyer's balance. There is **no Stripe
   refund** (nothing was charged per event). v1 returns the credit on any
   pre-event cancel — costless to the host (the pass was prepaid) and friendly
   to the buyer; the per-event refund-window nuance does not apply to passes.
6. **Expiry is host-set and unused credits are non-refundable.** The host
   optionally sets "credits expire N days after purchase" (or never);
   `pass_purchases.expires_at` is stamped at purchase completion. Expired credits
   can't be redeemed and aren't auto-refunded (the host can refund out-of-band
   from their Stripe dashboard).

### Schema (migration `20260930000000_season_passes.sql`)

- `host_passes` — the product (host_id, title, description, credit_count,
  price_cents, expires_in_days nullable, status active/archived). Owner-RLS by
  `host_id`; public read of `active` rows so buyers can see a host's offerings.
- `pass_purchases` — a buyer's balance (pass_id, host_id snapshot, buyer_user_id,
  title_snapshot, credits_total, price_cents, expires_at, Stripe payment columns).
  Buyer reads own; host reads purchases of their passes. Writes are
  webhook/admin only (like `host_subscriptions`).
- `event_participant_payments.pass_purchase_id` — new nullable FK marking a
  participant row as redeemed against a purchase (reuses the existing payment row
  rather than adding a `pass_redemptions` table; `credits_used` = count of these
  per purchase, and participant-delete cascade returns the credit automatically).
- `events.accepts_pass_credits boolean not null default false` — host opt-in.
- `redeem_pass_credit(p_purchase_id, p_event_id)` — `SECURITY DEFINER` RPC with
  an explicit `auth.uid() = buyer_user_id` gate (AGENTS pattern #8): it must
  write a `paid` payment row, which the self-write RLS policy forbids (that
  policy only permits `pending` self-inserts), so a definer with an explicit
  owner gate is correct. Locks the purchase row `for update`, re-checks
  eligibility + remaining credits + not-expired + not-already-joined, inserts the
  participant (capacity trigger fires → raises `full`), inserts the paid
  zero-amount payment row, returns the participant id.

### Webhook fulfillment

A new `pass_purchase` checkout kind: `checkout.session.completed` marks the
`pass_purchases` row paid and stamps `expires_at` (from the pass's
`expires_in_days`); `checkout.session.expired` drops the pending purchase.
Mirrors the attendee/tip fulfillment in
[checkout.ts](../../apps/web/src/lib/webhooks/checkout.ts). No ledger row in v1
(see Decision #2).

## Consequences

- ✅ Passes route money exactly like tickets (host Connect destination, tiered
  fee), so the existing payout/refund machinery applies to the purchase charge.
- ✅ Redemption reuses `event_participants` / `event_participant_payments`, so a
  pass attendee is indistinguishable from a paid attendee to rosters, check-in
  (when built), reminders, capacity, and the refund/leave path. Minimal new
  surface area.
- ✅ Credit accounting is a single derived count (`credits_total − live
redemptions`) with participant-delete cascade returning credits — no separate
  redemption-state machine to keep in sync.
- ⚠️ **Pass income is not in the global earnings page / tax CSV in v1** (see
  Decision #2). The host sees pass revenue on the pass-management page; the buyer
  has Stripe's emailed receipt. Ledger integration is a tracked follow-up so we
  don't destabilize the audited receipts surface in the same bundle.
- ⚠️ **Open-play only in v1.** Tournaments/leagues use team registration, a
  different payment aggregate; passes there are out of scope.
- ⚠️ **Pro-gating is enforced at pass _creation_.** If a host lapses from Pro,
  existing passes keep working (already-sold credits are honored; the host just
  can't create new passes) — consistent with "no clawback."
- ❌ No partial/pro-rated refund of unused credits in v1 (host-set expiry +
  out-of-band refund only). Revisit if buyers ask.
- ❌ No cross-host or platform-wide passes. A pass is one host's; a credit never
  crosses hosts.

## Alternatives considered

- **Series-scoped passes** (tied to one `seriesName`). Tighter mental model but
  requires robust series setup and constrains the credit to one recurring slot.
  Rejected for v1 in favor of host-wide opt-in, which is more flexible and
  doesn't depend on the series extension.
- **Redeem at check-in.** There is no host check-in flow today, and for a paid
  event the spot is reserved at sign-up — decrementing at a non-existent
  check-in would desync reservation from payment. Rejected.
- **Any host can sell passes.** Forfeits a strong Pro hook and muddies the
  free-tier paid-event cap (is a pass a paid event?). Rejected — Pro-only.
- **A dedicated `pass_redemptions` table.** Cleaner history but duplicates the
  participant↔payment link and needs its own refund/forfeit state. Reusing
  `event_participant_payments.pass_purchase_id` + cascade is simpler and correct
  for the v1 "return credit on cancel" policy.

## References

- [docs/audits/monetization.md § O-1](../audits/monetization.md) — the opportunity.
- [docs/adr/0014-monetization-strategy.md](0014-monetization-strategy.md) —
  Pro-as-host-toolkit framing; passes are a net-new Pro perk.
- [docs/payments.md](../payments.md) — host-routed vs platform-direct charges;
  passes are host-routed (destination charge), unlike sponsor/badge unlocks.
- [apps/web/src/app/events/[id]/checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts)
  — the ticket reservation+checkout flow passes mirror.
