# Payments & host payout routing

This page documents **who receives money** when an event collects payment
through Stripe. Read this before touching anything in
[`apps/web/src/app/events/*/checkout-actions.ts`](../apps/web/src/app/events/),
[`apps/web/src/app/events/[id]/tip-actions.ts`](../apps/web/src/app/events/[id]/tip-actions.ts),
[`apps/web/src/lib/host-stripe-account.ts`](../apps/web/src/lib/host-stripe-account.ts),
or the `host_stripe_accounts` schema.

For webhook wiring, see [stripe-webhooks.md](stripe-webhooks.md).
For env vars and onboarding, see the Stripe section of
[integrations.md](integrations.md#stripe).

---

## TL;DR

> **An event's payout destination is resolved by `getEventPayoutAccount(eventId,
hostId)`** ([apps/web/src/lib/event-payout.ts](../apps/web/src/lib/event-payout.ts)):
> the user in `events.host_id` by default, **or** the group's Connect account when
> the host opted a **Club** group in via `events.payout_group_id` (ADR 0038). Every
> existing and non-opted event resolves to `host_id` exactly as before. The
> destination is frozen once a registration is paid (same lock as the price), and
> **never falls back to the host** if a group-routed event's club account isn't
> ready — it returns "not ready" instead, so club money can't land on an
> individual. `host_group_id` and co-hosts remain authorization/display metadata.

The old workaround (nominate one admin to own Stripe and create all events as
them) still works for groups without Club; **Club (ADR 0038) is the first-class
fix** — see [§ Group payouts (Club tier)](#group-payouts-club-tier) below.

---

## Schema

| Table / column                                          | What it holds                                           | Notes                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `events.host_id` (NOT NULL, FK → `profiles.id`)         | The user who owns the event and receives all payments.  | Set at creation. Cannot be changed afterwards (the edit form does not expose it).                   |
| `events.host_group_id` (nullable, FK → `groups.id`)     | The group the event is hosted on behalf of.             | Pure metadata: drives RLS, "hosted by …" UI, and visibility. **Not** read by any payment code path. |
| `event_co_hosts` (one row per extra host)               | Additional users or groups granted co-host permissions. | Same story — no effect on payment routing.                                                          |
| `host_stripe_accounts.user_id` (PK, FK → `profiles.id`) | Stripe Connect account for a single user.               | Per-user payout account.                                                                            |
| `group_stripe_accounts.group_id` (PK, FK → `groups.id`) | Stripe Connect account for a **Club** group.            | A group payout account (ADR 0038). Events opt in via `events.payout_group_id`. See § Group payouts. |
| `events.payout_group_id` (nullable, FK → `groups.id`)   | Opt-in group payout destination for this event.         | NULL (default + all legacy rows) = pay out to `host_id`. Frozen once a registration is paid.        |

Schema sources:

- [supabase/migrations/20260512000000_init.sql](../supabase/migrations/20260512000000_init.sql)
  — `events.host_id`.
- [supabase/migrations/20260513000700_groups_and_co_hosts.sql](../supabase/migrations/20260513000700_groups_and_co_hosts.sql)
  — `events.host_group_id` + co-hosts + RLS that grants group admins
  manage rights on the event.
- [supabase/migrations/20260515000000_stripe_foundation.sql](../supabase/migrations/20260515000000_stripe_foundation.sql)
  — `host_stripe_accounts` keyed on `user_id`.

Domain model:

- The `VolleyballEvent` aggregate only knows about `hostId: UserId`. It
  has no notion of a host group; that's an application-layer concern.
  See [packages/domain/src/events/volleyball-event.ts](../packages/domain/src/events/volleyball-event.ts).
- `HostStripeAccount` is keyed on `hostId: string` (a user id). See
  [packages/domain/src/payments/host-stripe-account.ts](../packages/domain/src/payments/host-stripe-account.ts)
  and [packages/infrastructure/src/supabase-host-stripe-account-repository.ts](../packages/infrastructure/src/supabase-host-stripe-account-repository.ts).

---

## Payment routing — per-event flows go through the payout resolver

The three **per-event** money flows (ticket / team / tip — and the league
roster-team checkout) resolve their destination through
`getEventPayoutAccount(eventId, hostId)`
([event-payout.ts](../apps/web/src/lib/event-payout.ts)): the group's Connect
account when `events.payout_group_id` is set (Club opt-in, ADR 0038), else
`events.host_id`'s account. The platform `application_fee` always keys on the
host user's tier — Club changes only _where the payout lands_, not the fee.

| Flow                       | File                                                                                                              | Destination resolved from                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Individual ticket checkout | [apps/web/src/app/events/[id]/checkout-actions.ts](../apps/web/src/app/events/[id]/checkout-actions.ts)           | `getEventPayoutAccount(eventId, pricing.hostId)` → group account if opted-in (ADR 0038), else `events.host_id`                                                                                                 |
| Team registration checkout | [apps/web/src/app/events/[id]/team-checkout-actions.ts](../apps/web/src/app/events/[id]/team-checkout-actions.ts) | `getEventPayoutAccount(eventId, event.hostId)` (+ roster-team-checkout-actions.ts for leagues)                                                                                                                 |
| Tip jar                    | [apps/web/src/app/events/[id]/tip-actions.ts](../apps/web/src/app/events/[id]/tip-actions.ts)                     | `getEventPayoutAccount(eventId, event.host_id)`; tip row also stores `host_id`                                                                                                                                 |
| Season-pass purchase       | [apps/web/src/app/events/[id]/pass-actions.ts](../apps/web/src/app/events/[id]/pass-actions.ts)                   | `host_passes.host_id` → `getHostStripeAccount(hostId)`; tiered platform fee ([ADR 0037](adr/0037-season-passes.md))                                                                                            |
| Membership subscription    | [apps/web/src/app/events/[id]/membership-actions.ts](../apps/web/src/app/events/[id]/membership-actions.ts)       | `host_membership_plans.host_id` → `getHostStripeAccount(hostId)`; **recurring** Connect destination subscription, `application_fee_percent` at the host's tier ([ADR 0037 Phase 2](adr/0037-season-passes.md)) |

> **Passes and memberships are host-routed, not platform-direct.** A pass
> _purchase_ and a membership _subscription_ are both destination charges to the
> host (above) — the membership is a **recurring** Stripe subscription
> (`mode: 'subscription'` + `subscription_data.transfer_data`), the only
> recurring host-routed flow; the others are one-shot. Redeeming a pass credit or
> claiming a member spot moves **no money** — it reserves a spot against the
> prepaid balance / active subscription — so neither is a routing entry. (Contrast
> the sponsor/badge unlocks below, which charge PickupVB's own account; and the
> PickupVB-Pro subscription, which is platform-direct recurring.)

`getHostStripeAccount(hostId)` (see
[apps/web/src/lib/host-stripe-account.ts](../apps/web/src/lib/host-stripe-account.ts))
returns the Stripe `acct_…` id only when `charges_enabled` is true; null
otherwise. Callers use that id as the Stripe Checkout `destination`
(direct charge on connected account model).

`host_group_id` is **never** read in any of those paths.

**Leagues follow the exact same rule.** League season-fee checkout
reuses `team-checkout-actions.ts` — same `event.hostId` →
`getHostStripeAccount(hostId)` resolution as tournament team
registration. There is no recurring-billing path for leagues; season
fees are one-shot Checkout Sessions. When a club (group) runs a
league, the creating user's Stripe Connect is the payee for the life
of the event, the same way it is for tournaments and open plays.
See [docs/audits/event-data-model.md § P3 #11](audits/event-data-model.md#p3-11--eventshost_group_id--payment-routing-already-documented-but-call-it-out-for-leagues)
and the [ADR 0006 addendum](adr/0006-event-divisions.md#addendum-2026-05-30--league-event-type).

---

## Platform-direct charges (NOT host-routed)

Three money flows charge **PickupVB's own Stripe account** directly. They do
**not** set `transfer_data.destination`, take **no** `application_fee`, and
require **no host Connect onboarding** — a host with zero Stripe setup can still
buy them. This revenue is PickupVB's, not host payout income, so `events.host_id`
never enters the routing:

| Flow                  | File                                                                                                               | Amount (source of truth)                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Sponsor slot unlock   | [sponsor-actions.ts](../apps/web/src/app/events/[id]/edit/sponsor-actions.ts) → `startSponsorSlotCheckoutFromForm` | `SPONSOR_SLOT_UNLOCK_CENTS` ($3) — [lib/pro.ts](../apps/web/src/lib/pro.ts) |
| Badge slot unlock     | [badge-actions.ts](../apps/web/src/app/events/[id]/edit/badge-actions.ts) → `startBadgeSlotCheckoutFromForm`       | `BADGE_SLOT_UNLOCK_CENTS` ($5) — [lib/pro.ts](../apps/web/src/lib/pro.ts)   |
| Pro Host subscription | [pro/actions.ts](../apps/web/src/app/profile/billing/pro/actions.ts) (Stripe Billing)                              | `$10/mo` or `$100/yr` — `STRIPE_PRO_*_PRICE_ID` env                         |

The two slot unlocks are Free-tier add-ons (Pro includes both); the subscription
is recurring Pro. Their checkout sessions are created directly via
`getStripe().checkout.sessions.create` — **not** through
[checkout-session.ts](../apps/web/src/lib/checkout-session.ts)'s
`createDestinationCheckoutSession`, precisely because there's no destination.

**No ledger row, on purpose.** The `sponsor_slot` / `badge_slot` checkout
webhooks ([checkout.ts](../apps/web/src/lib/webhooks/checkout.ts)) write the
sponsor/badge-access row but **deliberately do not** write an
`event_payment_audit` row: the host is the _buyer_ here, not the payee, so these
are excluded from the host-earnings / receipts surfaces. The category enum +
CHECK reserve `sponsor_slot`/`badge_slot` for forward-compat only — see
[20260926000000_payment_audit_category.sql](../supabase/migrations/20260926000000_payment_audit_category.sql).
The buyer's receipt is Stripe's emailed receipt from the platform account
(confirm receipt emails are enabled on the **live** platform account).

> **Do not "fix" these by adding `transfer_data.destination`.** Routing them to
> the host would hand PickupVB's add-on / subscription revenue to the host.

---

## Event creation: which Stripe account is gated?

[apps/web/src/app/events/new/actions.ts](../apps/web/src/app/events/new/actions.ts):

1. `CreateEventCommand(user.id, …)` — the **creating user** becomes
   `events.host_id`.
2. If the form passes `hostGroupId`, it's persisted in a follow-up update
   to `events.host_group_id`. This step does not validate the group's
   Stripe state.
3. For paid, on-platform events, `requireHostChargesEnabled(user.id)` is
   called against the **creating user**, not the group.

So if Alice (admin of Group X) creates a paid event on behalf of Group X:

- `events.host_id = alice.id`
- `events.host_group_id = group_x.id`
- Stripe readiness is checked on Alice.
- Funds flow to Alice's Stripe Connect account.
- Alice and every owner/admin of Group X can manage the event (RLS); only
  Alice ever sees the money.

The event-edit flow ([apps/web/src/app/events/[id]/edit/actions.ts](../apps/web/src/app/events/[id]/edit/actions.ts))
follows the same rule: when flipping an event to paid it calls
`requireHostChargesEnabled(host_id)` where `host_id` is the row's
existing value, not the editing user.

---

## UI implications

The "create event" form
([apps/web/src/app/events/new/new-event-form.tsx](../apps/web/src/app/events/new/new-event-form.tsx))
and the tip jar
([apps/web/src/app/events/[id]/\_components/tip-jar.tsx](../apps/web/src/app/events/[id]/_components/tip-jar.tsx))
both gate their on-platform payment controls on the **creating user's**
Stripe state (create-event form) or the **primary host user's** Stripe
state (tip jar). They do not consult the host group.

If you find yourself wanting to render UI based on "the group's"
payment readiness, you almost certainly want the host user's instead —
or you've found a genuine product gap that requires schema work (see
the open question below).

---

## Buyer-paid processing fee

Stripe's processing fee (2.9% + 30¢ on US online cards) is taken
off the destination charge before the host's payout. By default,
**new events opt the buyer into paying that fee as a separate
"Processing fee" line item at checkout** so the host receives the
full advertised ticket + service-fee subtotal. The column is
`events.pass_processing_fee_to_buyer` (added in migration
[20260616000000_events_pass_processing_fee_to_buyer.sql](../supabase/migrations/20260616000000_events_pass_processing_fee_to_buyer.sql));
events created before that migration are backfilled `false` so
already-advertised prices don't shift under buyers.

The rule is in
[apps/web/src/lib/event-pricing.ts](../apps/web/src/lib/event-pricing.ts)
via `buyerProcessingFeeCents()`:

```
if (hostAbsorbsFee || !passProcessingFeeToBuyer) return 0;
return ceil(0.029 * subtotal) + 30;   // subtotal = ticket + platformFee
```

`host_absorbs_fee = true` **always** wins: a host who already opted
into "what you see is what you pay" pricing doesn't get a
processing-fee line stacked on top. The toggle lives next to the
existing pricing controls on both the create and edit forms and is
gated by the same `isPricingLocked()` check as
`host_absorbs_fee` (locks once a ticket has sold).

We use the **simple one-pass formula** (`ceil(2.9%) + 30¢` on the
pre-processing subtotal) rather than solving the fee-on-fee fixed
point. The host loses a sub-cent on every ticket compared to an
exact gross-up; that matches Eventbrite/Stripe industry practice.

**Refund asymmetry:** Stripe does not return the processing fee
on a refund regardless of who paid it on the front end. A refunded
$20 ticket still costs the host ~$0.91 either way. This is not new
behavior — the buyer-paid mode just means the host doesn't eat the
fee on the **non-refunded** path either.

---

## Off-platform payments

`events.payments_off_platform = true` is a product mode, not a degraded
fallback. When a host opts in, **Stripe is never involved** for that
event — collection, refunds, fees, and payouts are handled entirely
outside the app (Venmo, cash at the door, club account, etc.). The app
records that the host is opting out and then deliberately suppresses
every Stripe-shaped affordance.

> **Off-platform is not a registration-config escape hatch.** Per
> [ADR 0012](adr/0012-registration-paradigm-invariants.md), the
> canonical matrix of `events.type` × `team_registration_mode` ×
> `team_composition` × `price_unit` is enforced identically whether the
> event is on-platform or off-platform. The captain still pays for the
> team in team modes; per-player pricing is still rejected on team
> events. Off-platform only changes _who handles the money_, not _what
> shape of registration the platform accepts_.

**UI consequences (intentional):**

- **Create form** ([apps/web/src/app/events/new/new-event-form.tsx](../apps/web/src/app/events/new/new-event-form.tsx))
  — when `paymentsOffPlatform` is checked (or the creating user has no
  Connect account at all), the on-platform-only inputs are hidden:
  refund window, "host absorbs the 5% service fee."
- **Edit form** ([apps/web/src/app/events/[id]/edit/edit-event-form.tsx](../apps/web/src/app/events/[id]/edit/edit-event-form.tsx))
  — same gating. Toggling the checkbox client-side hides/shows the
  fields without round-tripping.
- **Paid ticket panel** — fee math (the platform 5% + Stripe processor
  fee breakdown) is suppressed for off-platform paid events. We only
  show the headline price; anything else would be a lie about who
  collects and what is deducted.
- **No "Stripe-readiness" gating.** Off-platform events are allowed to
  set a price even if the host has no Connect account, because the
  price is just a number to display to attendees — the app will not
  attempt to charge anyone.

**Product rationale.** Calculating and rendering Stripe processor /
platform fees on an event the platform is not processing is misleading
at best and false at worst. The number we'd display would have no
relationship to the host's actual cost basis. We'd rather show nothing
than show a wrong number, so the off-platform mode treats Stripe as
genuinely absent for the event's whole lifecycle.

**Known follow-ups** (not user-visible but worth tightening):

- `EventPricing` ([apps/web/src/lib/event-pricing.ts](../apps/web/src/lib/event-pricing.ts))
  does not yet carry `paymentsOffPlatform`, so
  `attendeeChargeBreakdownAsync` still computes a platform-fee number
  for off-platform paid events. The UI hides it, but the computation is
  wasted (and a foot-gun if someone wires that value somewhere new).
  Thread the flag through and short-circuit to
  `{ ticketCents: priceCents, platformFeeCents: 0, totalCents: priceCents }`.
- `startTicketCheckout`
  ([apps/web/src/app/events/[id]/checkout-actions.ts](../apps/web/src/app/events/[id]/checkout-actions.ts))
  doesn't guard against `paymentsOffPlatform === true`. There is no
  current code path that calls it for an off-platform event, but defence
  in depth: `backWithError(eventId, 'off_platform')` if the flag is set.

---

## Edge cases

- **Group is host, host user has no Stripe.** Paid registration is
  rejected at the event-create boundary. The event can still be created
  as free or off-platform.
- **Group has multiple admins, all with their own Stripe accounts.**
  Only the user who created the event receives payouts; the other
  admins' accounts are ignored.
- **Host user later loses Stripe access** (charges disabled, account
  closed). New tickets / tips can't be sold (the Connect destination is
  unavailable). Refunds of already-collected charges keep working
  through the existing payment intents — that path doesn't re-resolve
  the destination.
- **Co-host added after creation.** Co-hosts get RLS manage rights via
  [supabase/migrations/20260513000700_groups_and_co_hosts.sql](../supabase/migrations/20260513000700_groups_and_co_hosts.sql);
  they never receive money for the event.

---

## Group payouts (Club tier)

> **Resolved 2026-06-08 by [ADR 0038](adr/0038-group-payouts-club-tier.md)** —
> this used to be the open "no group payouts" limitation.

A group on the paid **Club** tier (`group_subscriptions`, ~$25/mo Stripe Billing
on the platform account, gated by `is_club_group`) can connect its **own** Stripe
Connect account (`group_stripe_accounts`, keyed by `group_id`; onboarding mirrors
the host flow, the account tagged `metadata.owner_type='group'` so the
`account.updated` webhook mirrors into the group table). A **group-hosted** event
can then opt to pay out to the club via `events.payout_group_id`.

The money-safety rules (see ADR 0038):

- **Opt-in + immutable-once-sold.** `payout_group_id` defaults null (= host_id,
  unchanged for every existing event). It's set/cleared on the event edit page
  only while the price is unlocked (`isPricingLocked` false); once a registration
  is paid the destination is frozen, like `host_id`.
- **No host fallback.** `getEventPayoutAccount` returns the group account when
  opted-in; if that account isn't `charges_enabled` it returns `null` (checkout
  shows "not ready"), **never** the host — club money can't land on an
  individual.
- **Fee unchanged.** The platform `application_fee` still keys on the host user's
  tier; Club is a separate paid product, not a fee discount (multi-admin Pro is a
  deferred follow-up).
- **Scope:** ticket / team / tip per-event flows only. Passes + memberships are
  host-user products and stay user-routed (rows above).

Group management lives at `/groups/[slug]/billing`
([page](../apps/web/src/app/groups/[id]/billing/page.tsx) +
[actions](../apps/web/src/app/groups/[id]/billing/actions.ts)); the per-event
opt-in is the "Club payouts" panel on the event edit page
([payout-actions.ts](../apps/web/src/app/events/[id]/edit/payout-actions.ts)).

**Deferred:** multi-admin Pro, club analytics, and surfacing club payout income
in the (per-user) earnings page.
