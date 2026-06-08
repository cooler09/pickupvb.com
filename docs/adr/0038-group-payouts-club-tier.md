# 0038. Group payouts + Club tier (pooled payouts for clubs)

- **Status:** Accepted
- **Date:** 2026-06-08

## Context

[Monetization audit O-2](../audits/monetization.md) and the standing limitation
in [payments.md § Open question](../payments.md) call for **group-owned payouts**:
today every event pays out to exactly one user (`events.host_id`), and a club
that wants pooled payouts must nominate one admin as "treasurer," onboard Stripe
under that user, and create every event as them. payments.md explicitly says:
_"No ADR has been written for this; raise one before touching the routing."_
This is that ADR.

Confirmed forks (2026-06-08): **paid Club subscription** (the monetization),
**per-event immutable opt-in routing** (the money-safety choice), **pooled
payouts only** in v1 (defer multi-admin-Pro + club analytics). Safe defaults:
a **separate `group_stripe_accounts` table** (don't mutate the per-user one), the
group **owner/admin** manages it, and Club billing is **Stripe Billing on the
platform account** (PickupVB charges the group), mirrored like `host_subscriptions`.

## Decision

### A "Club" is a paid group subscription whose marquee perk is a group payout account

1. A group owner/admin subscribes the group to **Club** (~$25/mo, Stripe Billing
   on the platform account — PickupVB is the merchant, like Pro). State mirrors
   into `group_subscriptions` from the `customer.subscription.*` webhook, branched
   off `metadata.kind = 'club'`. `is_club_group(group_id)` gates the perk
   (trialing/active, or past_due within a 30-day period-end grace — the same M-2
   backstop as `is_pro_host`).
2. While Club is active, the group can **connect its own Stripe Connect (Express)
   account** (`group_stripe_accounts`, keyed by `group_id`). Onboarding mirrors
   the host flow (`accounts.create` + `accountLinks`), with the connected account
   tagged `metadata.owner_type = 'group'` so the `account.updated` webhook mirrors
   it into `group_stripe_accounts` instead of `host_stripe_accounts`.
3. **A group-hosted event can opt to pay out to the club account** via a new
   `events.payout_group_id` (nullable FK → `groups`). When set, the three
   per-event money flows (ticket / team / tip) route their destination charge to
   the group's Connect account; when null, they route to `events.host_id` exactly
   as before.

### The money-safety invariants (the whole point of the opt-in design)

- **Existing and non-opted events are completely unchanged.** `payout_group_id`
  defaults null → the resolver returns the host account, byte-for-byte today's
  behavior. No migration moves any money.
- **Opt-in is frozen once money has flowed.** The routing can be set/cleared on
  the edit page only while `isPricingLocked(eventId)` is false (no paid
  registration yet) — the same lock that freezes the price. Once a ticket sells,
  the destination is immutable, mirroring how `host_id` is immutable. A buyer
  never has their payment redirected to a party they didn't expect.
- **No host fallback.** `getEventPayoutAccount(eventId, hostId)` returns the
  **group** account when `payout_group_id` is set; if that group account isn't
  `charges_enabled`, it returns **null** (checkout shows "not ready") — it does
  **not** silently fall back to the host. Falling back would send club money to
  an individual. This is the single most important rule in the resolver.
- **The platform fee still keys on the host user.** Club changes _where the
  payout lands_, not the fee rate. `application_fee` stays
  `platformFeeCentsFor(events.host_id, …)` (the host user's Pro tier). Halving the
  fee for club admins is the deferred "multi-admin Pro," not part of v1.
- **Only the three per-event flows route to the group.** Passes and memberships
  are **host-user** products (`host_passes.host_id` / membership plans are a
  user's) — they stay user-routed. Sponsor/badge unlocks are platform-direct
  (unchanged).

### Scope boundaries (v1)

- **Pooled payouts only.** No multi-admin-Pro (Club doesn't grant Pro perks to
  admins) and no club-analytics dashboard — both deferred.
- **Club is the gate to connect + route**, but lapsing Club does **not** claw back
  routing on already-created events (their `payout_group_id` is frozen and the
  resolver honors it regardless of current Club status) — only the ability to
  connect an account or opt **new** events in is gated. Consistent with the
  no-clawback principle.

## Schema (migration `20261002000000_group_payouts_club.sql`)

- `group_stripe_accounts` (group_id pk → groups; stripe_account_id;
  charges/payouts/details flags). RLS: owner/admin read; admin-client writes
  (onboarding + webhook). The resolver reads it on the admin client (the buyer
  isn't a group admin).
- `group_subscriptions` (group_id pk → groups; Stripe Billing mirror — same shape
  as `host_subscriptions`). RLS: owner/admin read; admin-client writes.
- `events.payout_group_id uuid null references groups(id)` — the opt-in payout
  destination (null = host_id).
- `is_club_group(p_group_id)` — the gated status check (M-2 past_due backstop).

## Consequences

- ✅ Resolves the long-standing payments.md group-payout limitation, monetized as
  a recurring Club tier.
- ✅ The routing change is **surgical + opt-in**: one resolver, four call-site
  swaps (ticket/team/roster-team/tip) + the event-detail readiness gate; the fee
  path is untouched.
- ✅ Reuses the host Connect-onboarding and Pro-subscription shapes wholesale
  (`accounts.create`/`accountLinks`, Stripe Billing + webhook mirror).
- ⚠️ **Two owner types now flow through `account.updated`.** The handler branches
  on `account.metadata.owner_type`; a group account missing that metadata would
  fall through to the host path (no-op) — onboarding always sets it.
- ⚠️ **Club income / group payouts aren't in the host earnings page in v1** (the
  earnings surface is per-user). A group payout dashboard is a follow-up.
- ❌ No group payout for passes/memberships (host-user products) in v1.
- ❌ No multi-admin Pro, no club analytics (deferred).

## Alternatives considered

- **Polymorphic owner on `host_stripe_accounts`.** Mutating the per-user payout
  table (the most safety-critical table) to carry a group owner is far riskier
  than an additive parallel table. Rejected.
- **Auto-route to the group whenever an event is group-hosted.** Changes where
  existing/future group events pay out — a money-movement + backfill hazard.
  Rejected for per-event immutable opt-in.
- **Pooled payouts as a free feature.** Forfeits the O-2 monetization; the club
  persona is exactly who should fund the platform. Rejected for a paid Club tier.

## References

- [docs/payments.md](../payments.md) — routing (now with the group path) + the
  resolved open question.
- [docs/audits/monetization.md § O-2](../audits/monetization.md).
- [docs/adr/0014-monetization-strategy.md](0014-monetization-strategy.md) —
  no-clawback principle; Club is a net-new paid tier.
- [AGENTS.md § Pattern 7](../../AGENTS.md) — "all event payments route through
  `events.host_id`" — **amended by this ADR** to "…through the event payout
  resolver (`host_id`, or `payout_group_id` when the host opted a Club group in)."
