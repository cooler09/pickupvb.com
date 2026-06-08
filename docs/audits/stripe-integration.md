# Stripe integration audit

**Date:** 2026-06-08
**Scope:** The Stripe **code path** end-to-end — Connect onboarding, destination
checkout (ticket / team / roster / tip), à-la-carte slots (sponsor / badge),
Pro Billing subscriptions, the webhook receiver + per-type handlers, the
success/cancel reconcile routes, and refunds. This is a **correctness /
code-quality** review (bugs · gaps · improvements · stale code), distinct from
the strategy lens in [monetization.md](monetization.md) and the cost / ToS lens
in [third-party-integrations.md](third-party-integrations.md) (TPI-4/5/6 already
cover the API-version pin, the checkout idempotency key, and webhook dedup —
not re-litigated here).

Reference docs read alongside the code: [docs/payments.md](../payments.md)
(payout routing) and the migrations under `supabase/migrations/2026051*`.

---

## Status — 2026-06-08 — Initial audit (SI-1 + SI-2 fixed same day)

The integration is in good shape: signature verification + idempotent webhook
claim ([route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts)),
typed-error discipline, per-row Stripe idempotency keys on the destination
flows, host-payout routing centralized on `events.host_id`, and the
completed/expired/refund webhook handlers all evict the event cache. The
free-tier paid-event cap RPC drift is **already fixed**
([20260913000000](../../supabase/migrations/20260913000000_fix_host_paid_event_count_30d_event_divisions.sql)).

This audit found **no P1s**. **SI-1 + SI-2 fixed 2026-06-08** (uncommitted,
quad-green). Remaining backlog: **5 P3.**

| #    | Grade | Status   | One-line                                                                                             |
| ---- | ----- | -------- | ---------------------------------------------------------------------------------------------------- |
| SI-1 | P2    | ✅ Fixed | `payment_intent.payment_failed` handler matched zero rows (dead code) + latent eager-release footgun |
| SI-2 | P2    | ✅ Fixed | Success/cancel reconcile routes mutated but didn't evict `eventCacheTag` → stale post-payment UI     |
| SI-3 | P3    | Open     | No `charge.dispute.created` handling — chargeback leaves seat consumed + host un-notified            |
| SI-4 | P3    | Open     | Sponsor / badge à-la-carte checkout: no Stripe idempotency key + no synchronous success reconcile    |
| SI-5 | P3    | Open     | Stale comment in `pro/actions.ts` claims `invoice.*` webhook handling that doesn't exist             |
| SI-6 | P3    | Open     | Off-platform guard gaps in `startTicketCheckout` + `EventPricing` (already noted in payments.md)     |
| SI-7 | P3    | Open     | Minor: duplicate `platformFeeCentsFor` call per ticket checkout; `refund-window.ts` 4-space indent   |

### Remediation log — 2026-06-08

- **SI-1 — corrected understanding + honest fix.** The original write-up framed
  the 30-minute held seat as the bug and suggested resolving the PI→session and
  eager-releasing. On implementation that proved **unsafe**: `payment_intent.
payment_failed` fires while the Checkout Session is still `open`, so the buyer
  can retry and complete on that same session — eager release would delete the
  seat the later `checkout.session.completed` flips to `paid` (charged, holds
  nothing). The 30-min hold is in fact **by design** (`expires_at`), and the
  authoritative, _safe_ release paths are `checkout.session.expired` + the cancel
  route. The real defect was that the handler was **dead code** (matched zero
  rows) wearing a misleading comment, a footgun for the next maintainer. Fix:
  [`handlePaymentFailed`](../../apps/web/src/lib/webhooks/charge.ts) rewritten to
  a documented no-op; the orphaned by-PI methods
  (`deletePendingAttendeesByPaymentIntent` / `markPendingTipsFailedByPaymentIntent`)
  removed from the port
  ([event-payment-repository.ts](../../packages/domain/src/events/event-payment-repository.ts)),
  the adapter
  ([supabase-event-payment-repository.ts](../../packages/infrastructure/src/supabase-event-payment-repository.ts)),
  and both test files; the handler test now pins the safe-no-op contract.
- **SI-2 — cache eviction added.** Guarded `updateTag(eventCacheTag(eventId)) +
revalidatePath()` added after the mutating reconcile in
  [checkout/success](../../apps/web/src/app/events/[id]/checkout/success/route.ts),
  [team-checkout/success](../../apps/web/src/app/events/[id]/team-checkout/success/route.ts),
  [roster-team-checkout/success](../../apps/web/src/app/events/[id]/roster-team-checkout/success/route.ts),
  and the participant-release in
  [checkout/cancel](../../apps/web/src/app/events/[id]/checkout/cancel/route.ts) —
  matching the webhook's eviction so a redirect that beats the webhook no longer
  shows stale state.

---

## P2 findings

### SI-1 — `payment_intent.payment_failed` can't match the rows it tries to clean up

[`handlePaymentFailed`](../../apps/web/src/lib/webhooks/charge.ts#L23-L29) calls:

```ts
await repositories.eventPaymentRepo.deletePendingAttendeesByPaymentIntent(pi.id);
await repositories.eventPaymentRepo.markPendingTipsFailedByPaymentIntent(pi.id);
```

Both repo methods key off the **payment-intent id** on the pending row:

- [`deletePendingAttendeesByPaymentIntent`](../../packages/infrastructure/src/supabase-event-payment-repository.ts#L141-L153)
  filters `event_participant_payments.payment_intent_id = pi.id AND payment_status = 'pending'`.
- [`markPendingTipsFailedByPaymentIntent`](../../packages/infrastructure/src/supabase-event-payment-repository.ts#L155-L161)
  filters `event_tips.stripe_payment_intent_id = pi.id AND status = 'pending'`.

But a **pending row never carries a payment-intent id.** The reservation is
written with only `checkout_session_id`
([checkout-actions.ts#L118-L133](../../apps/web/src/app/events/[id]/checkout-actions.ts#L118-L202),
[tip-actions.ts#L98-L159](../../apps/web/src/app/events/[id]/tip-actions.ts#L98-L159));
`payment_intent_id` is written **only on completion** (`markAttendeePaymentPaidByCheckoutSession`
/ the success route). The Checkout-created PaymentIntent also carries no
identifying metadata — `payment_intent_data` in
[checkout-session.ts#L64-L73](../../apps/web/src/lib/checkout-session.ts#L64-L73)
sets only `application_fee_amount` + `transfer_data`, not `metadata`.

**Result:** on a card decline mid-checkout the handler matches **zero rows** — it
is effectively dead code for the attendee + tip paths. The held seat / pending
tip is reclaimed only by `checkout.session.expired`, i.e. after the **30-minute**
session TTL ([CHECKOUT_EXPIRES_SECS](../../apps/web/src/lib/checkout-session.ts#L11)),
not promptly. A buyer who declines and abandons (without hitting Stripe's
back/cancel button, which would fire the cancel route) silently holds a spot for
half an hour. The misleading shape also costs the next maintainer — the comment
says "Drop pending attendee reservations attached to this PI," which never
happens.

**Recommended fix (pick one):**

1. **Make the failed event actionable.** In the handler, retrieve the session(s)
   for the PI (`stripe.checkout.sessions.list({ payment_intent: pi.id })`) and
   reuse the existing by-session-id cleanup
   (`deletePendingAttendeeByCheckoutSession` / `deletePendingTip`). One extra
   API call, but it makes the prompt-release real.
2. **Or stamp the PI early.** Add `payment_intent_data.metadata` carrying the
   `kind` + a back-reference, and a follow-up that writes the PI onto the pending
   row, so both the failed and refunded paths can match. (More moving parts.)
3. **Or, if the 30-min expiry backstop is acceptable, delete the attendee/tip
   branches from `handlePaymentFailed`** and document that
   `checkout.session.expired` is the authoritative pending-cleanup path — so the
   handler stops pretending to do something it can't.

**Fixed (2026-06-08) — see remediation log.** On implementation, option 1
turned out to be **unsafe** (the session is still retryable when this fires, so
eager release loses the seat the later completion expects). Resolved via option
3: the handler is now a documented no-op and the dead by-PI methods were removed.

### SI-2 — Success / cancel reconcile routes mutate state but never evict the event cache

The event-detail page reads pricing + team-payment status through
`unstable_cache` tagged with `eventCacheTag(id)` — see
[`loadEventPricingCached`](../../apps/web/src/app/events/[id]/_loaders/event-detail-cache.ts#L87-L92),
[`loadAdHocPublicRowsCached`](../../apps/web/src/app/events/[id]/_loaders/event-detail-cache.ts#L194-L274)
and [`loadAdHocRowsCached`](../../apps/web/src/app/events/[id]/_loaders/event-detail-cache.ts#L281-L336)
(both wrap `payment_status` and are cached **for every viewer**, signed-in
captain included). The webhook handlers correctly evict this tag after a
mutation — see the comment + `updateTag(eventCacheTag(...))` block in
[checkout.ts#L266-L283](../../apps/web/src/lib/webhooks/checkout.ts#L266-L283),
which exists precisely because "a buyer returning from Checkout sees a stale
roster until the 60s TTL lapses."

The **synchronous reconcile routes do the same DB mutation but skip the
eviction:**

- [team-checkout/success/route.ts](../../apps/web/src/app/events/[id]/team-checkout/success/route.ts#L56-L62)
  — `registration.markPaid(...)` + `save`, no `updateTag`/`revalidatePath`.
- [roster-team-checkout/success/route.ts](../../apps/web/src/app/events/[id]/roster-team-checkout/success/route.ts#L52-L58)
  — `payment.markPaid(...)` + `save`, no eviction.
- [checkout/success/route.ts](../../apps/web/src/app/events/[id]/checkout/success/route.ts#L43-L53)
  — flips the participant payment row to `paid`, no eviction.
- [checkout/cancel/route.ts](../../apps/web/src/app/events/[id]/checkout/cancel/route.ts#L27-L36)
  — **deletes** the pending participant, no eviction.

The whole point of these routes is to cover "the redirect can beat the webhook
(and locally `stripe listen` may not run at all)." But when the redirect _does_
win the race, the route updates the DB and the user is then redirected to a page
that re-reads the **stale, un-evicted** cache → the captain still sees
"Pending / Pay now" for up to 60 s (in local dev without `stripe listen`, the
webhook never fires, so 60 s is the only relief). The route fails at its own
stated job. This is the exact AGENTS.md pattern #1 ("mutating writes must
revalidate"; if the page reads from a tagged `unstable_cache`, also
`updateTag`).

**Recommended fix:** after each successful `markPaid` / participant-flip /
pending-delete in these routes, call
`updateTag(eventCacheTag(eventId)); revalidatePath(\`/events/${eventId}\`)` —
guarded in a try/catch like the webhook does so a revalidation hiccup can't
500 the redirect. (The team/roster _cancel_ routes don't mutate, so they're
fine as-is — but the attendee cancel route deletes a row and should evict too.)

**Fixed (2026-06-08) — see remediation log.** Guarded eviction added to all
three success routes + the attendee cancel route.

---

## P3 findings

### SI-3 — No chargeback / dispute handling

The dispatch switch
([route.ts#L140-L174](../../apps/web/src/app/api/webhooks/stripe/route.ts#L140-L174))
subscribes to `account.updated`, `checkout.session.{completed,expired}`,
`charge.refunded`, `payout.paid`, `payment_intent.payment_failed`, and
`customer.subscription.*`. There is **no `charge.dispute.created`** handler
(grep confirms zero dispute handling outside legal copy). When a buyer files a
chargeback on a ticket, Stripe claws the funds back from the host, but the app
leaves the attendee row `paid` and the **seat consumed**, and never notifies the
host. The refunds legal page already tells users chargebacks may get them
suspended ([refunds/page.tsx#L146-L147](../../apps/web/src/app/legal/refunds/page.tsx#L146-L147)),
but nothing operationalizes it.

**Recommended fix:** add a `charge.dispute.created` case → resolve the host via
the charge's PI, `notify('host.payment.disputed', …)` (new kind), and decide a
policy on the seat (likely free it, mirroring `charge.refunded`'s
delete-and-revalidate). Low frequency, so P3, but it's a money + capacity event
that currently goes dark.

### SI-4 — Sponsor / badge à-la-carte checkout: no idempotency key, no success reconcile

The two platform-fee slot purchases build their Checkout Sessions inline
instead of through `createDestinationCheckoutSession` (correct — they're direct
platform charges, not destination charges), but they skip two safeguards the
destination flows have:

- **No Stripe `idempotencyKey`** —
  [sponsor-actions.ts#L182-L212](../../apps/web/src/app/events/[id]/edit/sponsor-actions.ts#L182-L212),
  [badge-actions.ts#L195-L220](../../apps/web/src/app/events/[id]/edit/badge-actions.ts#L195-L220).
  An SDK network-retry (`maxNetworkRetries: 2`) can mint two sessions. Low harm
  (the buyer completes one; the other expires), but it's the same TPI-5 hygiene
  the ticket/tip/team flows apply.
- **No synchronous success reconcile.** `success_url` just lands on
  `/edit?sponsor=checkout_success`; the row only materializes when the
  `sponsor_slot` / `badge_slot` webhook fires. In dev without `stripe listen`
  (and during a prod webhook lag) the host pays but the unlock doesn't appear,
  with no "it's processing" affordance — unlike tickets/teams which reconcile in
  the success route.

**Recommended fix:** pass an idempotency key (e.g. `sponsor:<eventId>:<userId>`
scoped tighter if repeat purchases must be distinct) and add a lightweight
success-route reconcile (retrieve session → if paid, upsert the slot) mirroring
the ticket success route. Also consider `expires_at` for parity (these inherit
Stripe's 24 h default vs. the 30 min the destination flows use).

### SI-5 — Stale comment: `invoice.*` webhook handling that doesn't exist

[pro/actions.ts#L23](../../apps/web/src/app/profile/billing/pro/actions.ts#L23)
says "The webhook (`customer.subscription.*` / `invoice.*`) keeps the
`host_subscriptions` table in sync." There is **no `invoice.*` handler** — only
`customer.subscription.*`
([subscription.ts](../../apps/web/src/lib/webhooks/subscription.ts)). This is
benign for access control (Pro lapse is driven by `customer.subscription.updated`
flipping `status` to `past_due` → `unpaid`/`canceled`, and `is_pro_host` only
honors `trialing | active | past_due` per
[20260517000000](../../supabase/migrations/20260517000000_pro_subscriptions.sql#L54-L67)),
so dunning _works_ via the subscription event. But the comment misleads a reader
into thinking invoice events are wired.

**Recommended fix:** drop `/ invoice.*` from the comment (or, if you want
first-failed-invoice analytics / a dunning email, actually add the handler — but
that's a feature, not a bug).

### SI-6 — Off-platform guard gaps (already tracked in payments.md)

[docs/payments.md § Off-platform follow-ups](../payments.md) already lists these
as known; restating so they live in the backlog:

- `startTicketCheckout`
  ([checkout-actions.ts#L38](../../apps/web/src/app/events/[id]/checkout-actions.ts#L38))
  doesn't `backWithError(eventId, 'off_platform')` when
  `events.payments_off_platform === true`. No current path calls it for an
  off-platform event, but it's a defence-in-depth gap. (The roster flow _does_
  guard — [roster-team-checkout-actions.ts#L94](../../apps/web/src/app/events/[id]/roster-team-checkout-actions.ts#L94).)
- `EventPricing` ([event-pricing.ts](../../apps/web/src/lib/event-pricing.ts))
  doesn't carry `paymentsOffPlatform`, so `attendeeChargeBreakdownAsync` still
  computes a platform-fee number for off-platform paid events (UI hides it; the
  compute is wasted and a foot-gun if reused).

**Recommended fix:** thread `paymentsOffPlatform` through `EventPricing` and
short-circuit the breakdown; add the `off_platform` guard to
`startTicketCheckout`.

### SI-7 — Minor cleanups

- **Double fee compute per ticket checkout.** `startTicketCheckout` calls
  `platformFeeCentsFor(hostId, price)` once for `applicationFeeAmount`
  ([checkout-actions.ts#L141](../../apps/web/src/app/events/[id]/checkout-actions.ts#L141))
  and again inside `attendeeChargeBreakdownAsync`
  ([event-pricing.ts#L149](../../apps/web/src/lib/event-pricing.ts#L149)). Both
  hit `hasProBenefits` → `isPro` (React.cache-deduped per request, so the RPC
  isn't doubled), but the breakdown already returns `platformFeeCents` — pass it
  through as `applicationFeeAmount` and drop the second call.
- **`refund-window.ts` uses 4-space indentation**
  ([refund-window.ts](../../apps/web/src/lib/refund-window.ts)) against the
  repo's 2-space norm — the only file in the payments path that does. Prettier
  reformat.

---

## Things checked that are correct (no action)

- **Payout routing** is uniformly `events.host_id` → `getHostStripeAccount(hostId)`
  across ticket / team / roster / tip; `host_group_id` is never read on a money
  path. Matches [payments.md](../payments.md).
- **`application_fee_amount`** is always the platform's cut on the base price
  regardless of `host_absorbs_fee`; absorb only moves the fee between a buyer
  line item and the host's payout. Tips omit the fee entirely (0 → field
  omitted). Verified in
  [checkout-session.ts#L64-L73](../../apps/web/src/lib/checkout-session.ts#L64-L73).
- **Webhook idempotency** dedupes on `processed_at` (not row existence), so an
  orphaned claim from a mid-handler crash is re-driven (TPI-6); concurrent
  double-delivery is a deliberately-accepted, handler-idempotent edge.
- **Refund matching** works on the completed path — `findRefundableAttendeeByPaymentIntent`
  / `markTipsRefundedByPaymentIntent` key on the PI that _is_ stored at
  completion; `refunds.create` uses `refund_application_fee + reverse_transfer`
  for the destination charge.
- **Metadata anti-tamper** — both checkout-completed and subscription handlers
  reject a session/subscription whose `user_id` disagrees with the expanded
  customer's `user_id` (security audit P2 #7).
- **Pro dunning** correctly lapses access via `customer.subscription.updated`
  (see SI-5).
- **Paid-event-cap RPC** correctly counts via `event_divisions.price_cents`
  after the [20260913000000](../../supabase/migrations/20260913000000_fix_host_paid_event_count_30d_event_divisions.sql)
  fix; the `new/actions.ts` price-before-cap ordering off-by-one is also already
  fixed ([new/actions.ts#L362-L396](../../apps/web/src/app/events/new/actions.ts#L362-L396)).
