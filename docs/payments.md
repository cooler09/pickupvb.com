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

> **Every event has exactly one Stripe payout destination: the user in
> `events.host_id`.** Groups, co-hosts, and `events.host_group_id` are
> authorization metadata only — they never affect who the money lands
> with. This is fixed at event creation time and cannot be changed
> later.

If you need a group to share payouts, the workaround is to designate one
admin to own the Stripe account and create all the group's events while
signed in as that user.

---

## Schema

| Table / column                                          | What it holds                                           | Notes                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `events.host_id` (NOT NULL, FK → `profiles.id`)         | The user who owns the event and receives all payments.  | Set at creation. Cannot be changed afterwards (the edit form does not expose it).                   |
| `events.host_group_id` (nullable, FK → `groups.id`)     | The group the event is hosted on behalf of.             | Pure metadata: drives RLS, "hosted by …" UI, and visibility. **Not** read by any payment code path. |
| `event_co_hosts` (one row per extra host)               | Additional users or groups granted co-host permissions. | Same story — no effect on payment routing.                                                          |
| `host_stripe_accounts.user_id` (PK, FK → `profiles.id`) | Stripe Connect account for a single user.               | **There is no `group_stripe_accounts` table.** Groups cannot own a Stripe account.                  |

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

## Payment routing — every entry point goes through `host_id`

| Flow                       | File                                                                                                              | Destination resolved from                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Individual ticket checkout | [apps/web/src/app/events/[id]/checkout-actions.ts](../apps/web/src/app/events/[id]/checkout-actions.ts)           | `pricing.hostId` (= `events.host_id`) → `getHostStripeAccount(hostId)`          |
| Team registration checkout | [apps/web/src/app/events/[id]/team-checkout-actions.ts](../apps/web/src/app/events/[id]/team-checkout-actions.ts) | `event.hostId` (= `events.host_id`) → `getHostStripeAccount(hostId)`            |
| Tip jar                    | [apps/web/src/app/events/[id]/tip-actions.ts](../apps/web/src/app/events/[id]/tip-actions.ts)                     | `event.host_id` → `getHostStripeAccount(hostId)`; tip row also stores `host_id` |

`getHostStripeAccount(hostId)` (see
[apps/web/src/lib/host-stripe-account.ts](../apps/web/src/lib/host-stripe-account.ts))
returns the Stripe `acct_…` id only when `charges_enabled` is true; null
otherwise. Callers use that id as the Stripe Checkout `destination`
(direct charge on connected account model).

`host_group_id` is **never** read in any of those paths.

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

## Off-platform payments

`events.payments_off_platform = true` is a product mode, not a degraded
fallback. When a host opts in, **Stripe is never involved** for that
event — collection, refunds, fees, and payouts are handled entirely
outside the app (Venmo, cash at the door, club account, etc.). The app
records that the host is opting out and then deliberately suppresses
every Stripe-shaped affordance.

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

## Open question / known limitation

There is no support for **group-owned payout accounts** (e.g. a club
treasury). If a group wants pooled payouts, the only current option is
to nominate one admin as the "treasurer," do Stripe onboarding under
that user, and have them create every paid event.

If we ever need real group payouts, the work spans:

- A `group_stripe_accounts` table (or generalize `host_stripe_accounts`
  with a polymorphic owner).
- A "payout owner" column on `events` distinct from `host_id`, or a
  resolver that picks user-vs-group per event.
- Updating every site listed in the routing table above to consult the
  new resolver instead of `event.host_id`.
- A migration / backfill story for existing events.

No ADR has been written for this; raise one before touching the
routing.
