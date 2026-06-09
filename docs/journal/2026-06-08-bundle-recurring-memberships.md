# 2026-06-08 — Recurring host memberships (ADR 0037 Phase 2, monetization O-7)

## Context

Phase 2 of season passes (O-1): a **monthly membership** to a host. Confirmed
forks: **unlimited-while-active** (no credit ledger), **monthly only**,
**Pro-only to sell**, and it **reuses the existing `events.accepts_pass_credits`
opt-in**. Design recorded as an addendum to
[ADR 0037](../adr/0037-season-passes.md). Additive — the one-shot pass system is
untouched.

## Decisions

- **Unlimited-while-active, not credit-refill.** The chosen model has no
  per-period top-up: a member with an active subscription claims free spots on
  the host's pass-eligible open plays, full stop. That made the build markedly
  simpler than refill (no invoice-driven credit accounting, no proration) and is
  the stronger "membership" feel. `claim_membership_spot` reserves a normal
  attendee spot + a `paid`/0 `event_participant_payments` row stamped with
  `membership_id`; leaving just deletes the participant — **no decrement trigger**
  (nothing to return), unlike passes.

- **Billing is a Connect destination _subscription_** — the first recurring
  host-routed flow. Stripe Checkout `mode: 'subscription'` with
  `subscription_data.transfer_data.destination = host_acct` +
  `application_fee_percent` at the host's tier (Pro ⇒ 2.5%). PickupVB stays
  merchant of record (consistent with tickets/passes), so the **platform** account
  receives the `customer.subscription.*` events — no Connect-account webhook
  needed. Used inline `price_data.recurring` so no Stripe Price object has to be
  pre-created per plan.

- **One webhook, two subscription kinds.** `handleSubscriptionChange` now branches
  on `sub.metadata.kind === 'host_membership'` → mirror into `host_memberships`;
  everything else stays the PickupVB-Pro `host_subscriptions` path. The membership
  upsert is a manual update-by-`stripe_subscription_id`-else-insert (the unique
  index is partial on non-null, which PostgREST `upsert(onConflict)` can't target
  cleanly) — idempotent on redelivery. Added `host_membership.changed` /
  `host_membership` to the audit-log `AuditAction` / `AuditEntityType` unions
  (typecheck caught the missing variants).

- **Active rule = `is_active_member`**, mirroring `is_pro_host` incl. the M-2
  30-day past_due period-end backstop, so an abandoned past_due membership can't
  grant access forever if dunning is misconfigured. Cancellation is
  `cancel_at_period_end` via the Stripe API directly (the subscription is on the
  platform account — no billing-portal round-trip).

- **PassPanel precedence:** active member → "Claim your spot" (free); else
  redeemable pass credits → "Use a credit"; else buy options (membership plans +
  pass packs). A member never burns a credit. The panel stays fully defensive
  (data load in try/catch, JSX outside) per the `react-hooks/error-boundaries`
  lesson from the passes bundle.

## Surfaces

Migration `20261001000000_host_memberships.sql` (`host_membership_plans`,
`host_memberships`, `event_participant_payments.membership_id`, `is_active_member`,
`claim_membership_spot`). `lib/memberships.ts` + `lib/membership-helpers.ts`
(+ test). Host plan CRUD (`profile/billing/memberships/actions.ts`), buyer
subscribe/claim/cancel (`events/[id]/membership-actions.ts`), subscription-webhook
branch. Pages: host management (`/profile/billing/memberships`), buyer
`/profile/passes` (memberships + cancel; renamed "Passes & memberships"),
event-detail `PassPanel` (extended). Discoverability: billing quick-action.
Copy: pricing (feature + comparison row + FAQ), `features.md`, `payments.md`
routing (the recurring host-routed row). DB types hand-edited (flagged for regen).

## Deferred

Annual interval; credit-refill membership variant; membership income in the
earnings page + tax CSV (same `event_payment_audit` constraint deferral as O-1);
buyer-paid platform fee.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green (web: 346 tests
incl. `membership-helpers.test.ts`). Migration **not** applied locally
(deploy-gated). The live subscribe → webhook → claim round-trip — especially the
**Connect destination subscription** (`application_fee_percent` + `transfer_data`)
and the metadata-routed webhook — is unverified against a real Stripe env; that's
the main "does it actually work end-to-end" gap to run against dev after deploy.
