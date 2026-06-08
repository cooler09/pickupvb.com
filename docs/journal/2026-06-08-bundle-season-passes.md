# 2026-06-08 — Season passes / multi-session punch cards (ADR 0037, monetization O-1)

## Context

Following the monetization re-audit, the user asked to build **O-1** — the
strongest value-aligned opportunity: a host-priced prepaid credit pack an
attendee buys once and redeems per session. Wins for all three sides (attendee:
cheaper + one payment; host: committed up-front cash + less weekly Venmo
chasing; platform: normal ticket take-rate on a larger transaction, and it pulls
recurring hosts onto on-platform payments). Four product forks were confirmed
with the maintainer up front: **host-wide opt-in eligibility**, **Pro-only
selling**, **host-set expiry / non-refundable unused**, and **redeem at sign-up**
(there is no host check-in flow, so the reservation path is the only sensible
redemption point). Design of record: [ADR 0037](../adr/0037-season-passes.md).

## Decisions

- **Reuse `event_participants` + `event_participant_payments` for redemption;
  don't invent a parallel attendance model.** A redeemed credit reserves a normal
  attendee row with a `paid`, zero-amount payment row carrying a new
  `pass_purchase_id` FK. So a pass attendee is indistinguishable from a paid
  attendee to rosters, capacity, reminders, and the leave/refund path — minimal
  new surface. Redemption runs through `redeem_pass_credit`, a SECURITY DEFINER
  RPC (AGENTS pattern #8): it must write a `paid` payment row, which the
  pending-only self-write RLS policy forbids, so a definer with an explicit
  `auth.uid() = buyer_user_id` gate is correct. It locks the purchase row,
  re-checks eligibility/credits/expiry/not-already-joined, then inserts the
  participant (the capacity trigger still fires → raises `full`) and the payment
  row in one transaction — no overdraft, no orphan.

- **Credit accounting is a maintained counter, not a row count.** First cut
  counted `event_participant_payments` rows per purchase, but the buyer/host
  display needs `credits_remaining` and RLS on the payments table doesn't cleanly
  expose those rows to either party. Switched to a `pass_purchases.credits_used`
  counter: the RPC increments it; an AFTER DELETE trigger on
  `event_participant_payments` decrements it (floored at 0). Both buyer and host
  read remaining straight off `pass_purchases` under the existing select
  policies. **The cancel/credit-return path then needed zero new code:**
  `leaveEvent` → `refundAttendeeTicket` returns `not_paid` for a pass row (no
  `payment_intent_id`) → falls through to `LeaveEventCommand` → participant
  delete → payment-row cascade → the trigger returns the credit.

- **Passes are host-routed (destination charge), not platform-direct.** Unlike
  the sponsor/badge unlocks (PickupVB's own account — see
  [payments.md](../payments.md)), a pass purchase pays the host via Connect with
  the tiered platform fee, because it IS host income. v1 has the host **absorb**
  the platform fee (the host sets the sticker price); a buyer-paid fee line is a
  deferred follow-up.

- **No ledger/earnings integration in v1, on purpose.** `event_payment_audit.event_id`
  is `NOT NULL` and a pass purchase isn't event-scoped; making it nullable would
  be invasive surgery on the freshly-audited receipts surface
  ([receipts-tax.md](receipts-tax.md)). v1 surfaces pass revenue on the
  host's management page (sum of paid purchases) and relies on Stripe's emailed
  receipt for the buyer. Folding pass income into the earnings page + tax CSV is
  a tracked follow-up, deliberately not bundled with the schema-sensitive
  receipts code.

- **Defensive panel, JSX outside try/catch.** `PassPanel` does all its reads in
  a `try/catch` that returns null on any error (so it can never break the
  high-traffic event-detail render), then renders JSX from the returned data.
  The first cut wrapped the JSX in the try/catch and tripped
  `react-hooks/error-boundaries` (9 lint errors) — render errors want an error
  boundary, not try/catch. Splitting load-vs-render fixed it.

## Surfaces

Migration `20260930000000_season_passes.sql` (`host_passes`, `pass_purchases`,
`event_participant_payments.pass_purchase_id`, `events.accepts_pass_credits`, the
`redeem_pass_credit` RPC, the return-credit delete trigger). `lib/passes.ts`
(reads) + `lib/pass-helpers.ts` (pure, unit-tested). Host actions
(`profile/billing/passes/actions.ts`), buyer actions
(`events/[id]/pass-actions.ts`), `pass_purchase` webhook fulfillment. Pages: host
management (`/profile/billing/passes`, Pro-gated), buyer `/profile/passes`,
event-detail `PassPanel`, event-edit opt-in panel. Discoverability: billing
quick-action, profile-hub tile. Pricing page (Pro feature + comparison row +
FAQ). DB types hand-edited (flagged for regen on next `gen:types`).

## Deferred

- Pass income in the global earnings page + tax CSV (event_id NOT NULL; coordinate
  with the receipts-tax audit).
- Buyer-paid platform-fee line (parity with the ticket "service fee" option).
- Post-purchase confirmation banner (the open-play `resultCode` maps carry no
  pass message; the PassPanel balance is the current feedback).
- Per-event refund-window nuance on credit return (v1 returns the credit on any
  pre-event cancel — costless to the host since the pass was prepaid).
- Anti-gaming on leave-after-event (no check-in exists yet).

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green (lint: 0 errors,
3 pre-existing scoreboard warnings; 340 tests incl. `pass-helpers.test.ts`).
Migration is **not** applied locally (deploy-gated). The realtime/e2e path
(buy → webhook → redeem → capacity) is unverified against a live env — the main
"does it actually work end-to-end" gap, to run against dev after deploy.
