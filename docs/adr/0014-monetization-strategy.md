# 0014. Monetization strategy — Pro pricing, fee posture, free-tier cap

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

Pro Host shipped in
[supabase/migrations/20260517000000_pro_subscriptions.sql](../../supabase/migrations/20260517000000_pro_subscriptions.sql)
with concrete numbers — $10/month, $100/year, 14-day trial, 50% fee
discount on tickets+tips, free-tier cap of 1 paid event per rolling
30 days — but no document explained _why_ those specific knob
positions over plausible alternatives ($5 / $15 monthly, fee waiver
vs. discount, 0 / 3 / unlimited paid events on Free). The
[monetization audit](../audits/monetization.md) P1 #3 flagged this
gap: without a written rationale we'll churn the lever on a bad
month based on whichever number happens to be salient that day.

Pre-launch, with two-to-three target metros (Pittsburgh, Erie,
Cleveland) and no comparable telemetry yet, the right move is to
**lock in the current numbers and the criteria under which we'd
revisit them**, not to keep optimizing the price.

## Decision

The following parameters are the launch defaults. Each carries a
short reason and an explicit "revisit when" trigger.

### Pro subscription price: $10/mo or $100/yr (17% annual discount)

- **Why $10, not $5:** $5/mo undersells the perks shipped through
  Bundle 87 (saved templates, host analytics, sponsor slot, CSV
  export) and signals "trial / hobby" pricing. At the scale of a
  serial host running weekly paid open play, $10 is below the noise
  floor of one ticket's worth of revenue per event.
- **Why $10, not $15:** $15/mo crosses the threshold where a
  prospective host expects per-seat or unlimited-cohost-style
  enterprise features, and $15 is what Meetup-tier price-anchored
  hosts mentally compare us to. $10 keeps the comparison
  ("Eventbrite Pro is $X, Meetup is $24") on _our_ favorable side.
- **Why $100/yr (17% off, not 20%+):** matches SaaS norm; preserves
  monthly cash flow for users who can't justify the yearly outlay
  yet. Stripe billing handles the proration on upgrade.

### Platform fee: 5% Free / 2.5% Pro (50% discount, not waiver)

- **Why 50%, not full waiver:** zero-fee Pro creates a binary
  cliff — the moment a host has any payment volume they're better
  off paying $10/mo and routing every dollar through us. That's
  predatory and brittle; it incentivizes us to keep Free-tier hosts
  small. **Pro should be a fattening discount, not a binary
  unlock.**
- **Why 50%, not 80% / 0.5%:** the discount has to be visible on a
  payout summary at small GMV ($200/mo of tickets = $5 in saved
  fees, perceptible) but the platform still needs to clear infra
  costs (~$70–110/mo floor, see
  [monetization audit § Unit economics](../audits/monetization.md#unit-economics--the-numbers)).
  50% is the simplest number that hits both: hosts feel it, infra
  still covers, math is one-liner mental arithmetic.
- **Why 5% Free, not 3% or 7%:** competitive band is 3.5–10%
  (Eventbrite ~3.7% + $1.79, ClubExpress ~5%, Meetup flat). 5% with
  no per-ticket flat fee beats Eventbrite for sub-$50 tickets and
  ties at ~$100. We picked the lever that helps the typical
  $20-ticket open play, not the corporate $200-ticket clinic.

### Amendment 2026-06-01: tips take no platform fee (any tier)

**Supersedes** the "5% Free / 2.5% Pro on tickets **+ tips**" line above for the
**tips** half only. As of 2026-06-01 the platform fee on tips is **0% on every
tier.** Ticket fees are unchanged (5% Free / 2.5% Pro).

- **Why drop it, not keep parity with tickets:** a ticket sale is a transaction
  the platform _enabled_ (listing, capacity, checkout, refunds) — a take-rate is
  defensible there. A **tip** is a discretionary attendee→host transfer the
  platform didn't broker; skimming it reads as rent-seeking and is the weakest
  possible trust signal. "100% of your tip goes to the host" is a strong,
  cheap community signal — and pre-launch tip volume is small, so the forgone
  revenue is negligible against the goodwill.
- **Why 0%, not a small cap:** a cap ("$0.30 + 0% after") is harder to explain
  and dilutes the signal. A clean "we take nothing on tips" is the marketable
  line; the cap can be revisited only if tip volume ever becomes a material,
  abuse-prone surface (it isn't at 2–3 metros).
- **What stays true:** Stripe's processing fee (~2.9% + 30¢) still comes off any
  card charge — it's Stripe's, not ours, and the tip UI says so. We do not pass
  it to the tipper as a line item (tips are small; a fee line would dwarf the
  gesture).
- **Implementation:** `tipPlatformFeeCents()` in
  [apps/web/src/lib/event-pricing.ts](../../apps/web/src/lib/event-pricing.ts)
  returns 0 (named, unit-tested — the single place to change for a future cap);
  [tip-actions.ts](../../apps/web/src/app/events/%5Bid%5D/tip-actions.ts) uses it
  and stores `platform_fee_cents = 0`;
  [checkout-session.ts](../../apps/web/src/lib/checkout-session.ts) omits
  `application_fee_amount` when 0 so the destination charge transfers the full
  tip. Pricing / Pro / tip-jar copy updated. Source: monetization audit R-5.

### Amendment 2026-06-08: collectible event badges perk + à-la-carte add-on prices

Records two changes that landed after this ADR's original "nine perks" count in
Consequences below (which is now stale — the authoritative current Pro perk set
is whatever the pricing page lists).

- **Collectible event badges are a Pro perk** ([ADR 0031](0031-gamification-badges.md)) —
  Pro-included on every event; Free hosts unlock per-event à-la-carte. This
  follows the same "Pro grows via net-new features, never takeaways" rule the
  ADR commits to: the in-event badge surface is net-new, not a clawback.
- **The two host add-on à-la-carte prices are centralized** in
  [pro.ts](../../apps/web/src/lib/pro.ts) (monetization audit M-3): sponsor slot
  `SPONSOR_SLOT_UNLOCK_CENTS` ($3/event) and badges `BADGE_SLOT_UNLOCK_CENTS`
  ($5/event). The pricing + Pro page copy derives from these constants, so the
  number lives in exactly one place. Per the "rate changes need an ADR
  amendment" rule (Consequences below), **changing either value should be
  recorded as an amendment here.**

Both à-la-carte unlocks are **platform-direct charges** — PickupVB's own Stripe
account, no Connect `transfer_data.destination`, no host onboarding required.
See [docs/payments.md § Platform-direct charges](../payments.md#platform-direct-charges-not-host-routed).

### Free-tier cap: 1 paid event per rolling 30 days

- **Why 1, not 0:** "zero paid events on Free" makes us pure
  subscription-ware and excludes the casual host who runs one
  pickup tournament a quarter — the exact persona we want as
  community goodwill, not Pro conversion pressure. One paid event
  lets that host taste the platform end-to-end.
- **Why 1, not 3:** above 1, the host has no monetary incentive to
  upgrade until they hit the cap. At 3/month the savings break-even
  is roughly $1,200 GMV/mo — too generous for a $10/mo product.
  At 1/month, the second paid event in a 30-day window is the
  natural upgrade trigger, which is **exactly the host archetype**
  we built Pro for (serial host).
- **Counted as rolling 30 days, not calendar month:** prevents a
  host who runs back-to-back at month boundary from getting two
  effectively free paid events without subscribing.

### Free trial: 14 days, payment method required

- **Why 14:** long enough to publish one event, capture
  registrations, see the analytics dashboard populate; short enough
  to keep funnel telemetry tight. Industry standard for SMB SaaS.
- **Why payment-method-required:** filters tire-kickers and ensures
  the trial-to-paid conversion is mechanical (no "remember to put a
  card in" step at end-of-trial). Stripe Billing handles the trial
  → active transition; we observe it in the
  `customer.subscription.updated` webhook (Bundle 98).

### Stripe processing fee: passed to buyer by default (Bundle 83)

The 2.9% + $0.30 Stripe takes is a true variable cost we don't
control. Absorbing it on the host's payout silently broke the
host's mental model of "I charged $20, I got $19.09." Passing it
to the buyer as a line item matches Eventbrite/ClubExpress
convention and is the single biggest cheap host-trust win. See
[docs/audits/monetization.md § P1 #2](../audits/monetization.md#2-stripe-processing-fee-is-silently-absorbed-by-host).

### What we explicitly are _not_ monetizing pre-launch

- **Groups, co-hosts, push/SMS/email reminders, bracket generator,
  /about/numbers, public marketing surfaces.** All shipped free.
  Building Pro on top of free-by-default infrastructure means
  Pro is a host-tool product, not an unlocks-product.
- **Third-party display ads on event/group/home pages.** Per
  [monetization audit § P2 #4](../audits/monetization.md#4-host-owned-sponsor-slot-the-answer-to-the-sponsorship-question)
  — we sell host-owned sponsor slots, never platform-sold ad
  inventory.

## Success criteria (the numbers we'll measure)

The trial-to-paid funnel is now instrumented (Bundle 98,
`pro_trial_started` / `pro_trial_converted` analytics events fired
from the Stripe webhook). Six months post-launch we want to see:

| Metric                                          | Target            | Trigger to revisit                                     |
| ----------------------------------------------- | ----------------- | ------------------------------------------------------ |
| Trial → paid conversion                         | ≥ 30%             | < 20% sustained = re-evaluate trial length or perk mix |
| Pro share of active hosts                       | ≥ 15%             | < 5% after 50+ active hosts = price/perk mismatch      |
| Median time-to-Pro-decision                     | < 21d post-signup | > 60d = pricing page or perk surfaces failing          |
| Free → Pro upgrade after hitting paid-event cap | ≥ 25%             | < 10% = cap is wrong or perk mix is wrong              |

These targets aren't soft — sustained miss on conversion or share
is the only valid reason to move the price lever before the
six-month anniversary. **Don't churn pricing on a bad week.**

## Consequences

- ✅ The $10 / 50% / 1-event triple is now defendable in writing:
  any "should we cut to $7?" or "should we drop the cap?" question
  has a written counter and a measurable trigger. Future maintainer
  doesn't have to re-derive the rationale.
- ✅ Trial-funnel instrumentation (Bundle 98) makes the success
  criteria measurable rather than vibes-based.
- ✅ The "Pro = host operating system" framing the pricing page
  wants is now backed by a concrete perk count (nine perks as of
  Bundle 98), not three.
- ❌ We're committing to _not_ A/B-testing price pre-launch.
  Smaller sample sizes plus active product change make multi-arm
  pricing tests statistically meaningless; we'd be optimizing
  noise. Cost: we won't have empirical price elasticity at launch.
  Accepted because the alternative is fake-confident price changes.
- ❌ The 1-event/30d cap is enforced at
  [apps/web/src/lib/host-paid-event-cap.ts](../../apps/web/src/lib/host-paid-event-cap.ts).
  Loosening the cap (e.g. to 3) is a single-file change but moves
  the upgrade trigger meaningfully and should require a new ADR
  amendment, not a silent constant bump.
- ❌ The 50% fee discount is computed at
  [apps/web/src/lib/event-pricing.ts](../../apps/web/src/lib/event-pricing.ts).
  Same rule: rate changes need an ADR amendment.

## Alternatives considered

- **$5/mo Pro with no free-tier cap.** Cuts revenue per Pro by
  50%, and removes the cap-hit upgrade trigger that drives the
  serial-host conversion. Rejected — we'd be a charity for casual
  hosts and never see Pro float infra.
- **$15/mo Pro with unlimited co-hosts.** Would require gating
  co-hosts behind Pro, which is a takeaway from existing free
  users. Per the audit Q4 answer: not pursued. Pro grows through
  net-new features only.
- **Flat $1 / paid event for Free, no subscription.** Simple, but
  removes Pro entirely as a product and forfeits the recurring
  revenue smoothing that subscriptions provide vs. lumpy
  per-event take. Also makes the unit-economics floor harder to
  hit (more transactions needed to clear $90/mo).
- **Free trial without payment method.** Removes friction but
  shifts trial-end work to a notification + re-prompt flow we
  don't want to build pre-launch. Stripe Billing already handles
  the trial → active transition cleanly; using it is the
  lowest-engineering-cost path.
- **Per-metro tiered pricing** (cheaper Pro in smaller markets).
  Operationally complex (metro detection, currency, A/B
  measurement) and signals that Pro is overpriced in some places.
  Reconsider only if a launch metro shows clear underperformance.

## References

- [docs/audits/monetization.md](../audits/monetization.md) — the
  full audit; P1 #3 was the prompt for this ADR.
- [apps/web/src/lib/pro.ts](../../apps/web/src/lib/pro.ts) —
  `isPro`, the paid-event cap constant, Stripe price ids.
- [apps/web/src/lib/event-pricing.ts](../../apps/web/src/lib/event-pricing.ts)
  — fee computation (5% / 2.5%).
- [apps/web/src/lib/host-paid-event-cap.ts](../../apps/web/src/lib/host-paid-event-cap.ts)
  — Free-tier cap enforcement.
- [packages/domain/src/shared/analytics-port.ts](../../packages/domain/src/shared/analytics-port.ts)
  — `pro_trial_started` / `pro_trial_converted` event types.
- [apps/web/src/app/api/webhooks/stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts)
  — funnel event emission (`handleSubscriptionChange`).
- [supabase/migrations/20260517000000_pro_subscriptions.sql](../../supabase/migrations/20260517000000_pro_subscriptions.sql)
  — `host_subscriptions` schema + `is_pro_host()` source of truth.
- [docs/adr/0011-stripe-webhook-dedupe.md](0011-stripe-webhook-dedupe.md)
  — receiver-level idempotency the funnel events ride on top of.
