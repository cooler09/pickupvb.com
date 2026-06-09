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

## Addendum 2026-06-08 — Phase 2: recurring memberships (monetization O-7)

The finite credit pack (above) has a natural recurring sibling: a **monthly
membership** to a host. Confirmed forks: **unlimited-while-active** (no credit
counting), **monthly only**, **Pro-only to sell**, and it **reuses the same
`events.accepts_pass_credits` opt-in** (an event that takes pass credits also
takes active members). This is additive — the one-shot pass system is unchanged.

### Decision

1. A Pro host defines a `host_membership_plan` (title, description, monthly
   `price_cents`, status). A buyer subscribes; while their `host_memberships` row
   is **active** (`trialing` / `active`, or `past_due` within a 30-day
   period-end grace — same backstop as `is_pro_host`, monetization M-2) they can
   **claim a free spot on any of that host's `accepts_pass_credits` open-play
   events** — no per-session charge, no credit ledger.
2. **Billing routes to the host as a Connect destination _subscription_.** Stripe
   Checkout `mode: 'subscription'` with `subscription_data.transfer_data.destination
= host_acct` and `application_fee_percent` at the host's tier (Pro ⇒ 2.5%).
   PickupVB stays merchant of record, consistent with passes/tickets. The platform
   account receives the `customer.subscription.*` events; the subscription's
   `metadata.kind = 'host_membership'` (+ `plan_id` / `host_id` / `member_user_id`)
   routes the existing `handleSubscriptionChange` webhook to mirror state into
   `host_memberships` (vs. the PickupVB-Pro path, which has no such metadata).
3. **Claiming reuses the participant model.** `claim_membership_spot(p_event_id)`
   — a SECURITY DEFINER RPC with an `auth.uid()` gate — verifies an active
   membership for the event's host, then reserves the `event_participants` row
   (capacity trigger fires) + a `paid`, zero-amount `event_participant_payments`
   row stamped with `membership_id`. Leaving just deletes the participant; there's
   no credit to return (unlimited model), so — unlike passes — no decrement
   trigger is needed for memberships.
4. **Cancellation** is `cancel_at_period_end` via the Stripe API (the
   subscription lives on the platform account, so no billing-portal round-trip);
   the member keeps access through the paid period.

### Schema (migration `20261001000000_host_memberships.sql`)

- `host_membership_plans` — the product (RLS like `host_passes`: public read of
  `active`, owner writes; Pro enforced in the app).
- `host_memberships` — a member's subscription state mirrored from Stripe
  (member/host reads; admin/webhook writes — like `host_subscriptions`).
- `event_participant_payments.membership_id` — nullable FK marking a
  member-claimed spot.
- `is_active_member(p_user_id, p_host_id)` — the period-end-backstopped status
  check (reused by the claim RPC + the UI).
- `claim_membership_spot(p_event_id)` — the reserve-a-spot RPC.

### Precedence in the UI

On a pass-eligible event the `PassPanel` resolves, in order: **active member →
"claim your spot" (free)**; else **redeemable pass credits → "use a credit"**;
else **offer to buy** (membership plans + pass packs). A member never burns a
credit.

### Deferred

Annual interval; credit-refill membership variant (we shipped unlimited-access);
membership/pass income in the earnings page + tax CSV (same `event_payment_audit`
constraint deferral as O-1); a richer "manage membership" surface (v1 is
view + cancel on `/profile/passes`).

## References

- [docs/audits/monetization.md § O-1](../audits/monetization.md) — the opportunity (Phase 1) and O-7 (Phase 2).
- [docs/adr/0014-monetization-strategy.md](0014-monetization-strategy.md) —
  Pro-as-host-toolkit framing; passes are a net-new Pro perk.
- [docs/payments.md](../payments.md) — host-routed vs platform-direct charges;
  passes are host-routed (destination charge), unlike sponsor/badge unlocks.
- [apps/web/src/app/events/[id]/checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/checkout-actions.ts)
  — the ticket reservation+checkout flow passes mirror.
