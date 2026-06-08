# 0039. Host referrals + comped Pro grants

- **Status:** Accepted
- **Date:** 2026-06-08

## Context

[Monetization audit O-3](../audits/monetization.md) (carry-over of P3 #10): reward
a host who refers another host that becomes a real organizer with a free month of
Pro. Standard PLG — rewards advocacy, doesn't tax users. Two design questions
drove this ADR (confirmed with the maintainer 2026-06-08): **how the reward is
granted** and **when a referral qualifies**.

## Decision

### Reward = a comped Pro grant our own gate honors (not a Stripe coupon)

A reward is a row in **`pro_grants`** (`user_id`, `granted_until`, `reason`).
`hasProBenefits()` ([apps/web/src/lib/admin.ts](../../apps/web/src/lib/admin.ts))
ORs in "has an active grant" alongside the subscription + admin checks, so a
comped host gets **every** Pro perk for the window (fee discount, unlimited paid
events, passes/memberships, sponsor/badge, visibility, …) with **no Stripe coupon
plumbing** and regardless of whether they currently subscribe. The grant check
([pro-grants.ts](../../apps/web/src/lib/pro-grants.ts)) is a direct admin read
(`granted_until > now()`), `React.cache`-memoized, safe in cached contexts (no
`cookies()`).

- **`is_pro_host` is unchanged** — the subscription source of truth stays clean;
  the comp is layered in the app gate only. `isPro` (subscription display) stays
  false for a comped-only host; `hasProBenefits` (entitlement) is true. This is
  why **every Pro perk must gate on `hasProBenefits`, not bare `isPro`** — comps
  (and admin) only unlock through the former. (The Pro page shows a "Pro free
  until …" note for comped hosts.)
- Grants **stack**: a new reward extends from `max(latest active grant, now) +
30d`, so referring several hosts accrues months.

### Qualify = the referred host publishes ≥3 paid events

First-touch attribution + a high-intent, abuse-resistant milestone:

1. **Attribution.** `/r/<referrerUserId>`
   ([app/r/[code]/route.ts](../../apps/web/src/app/r/%5Bcode%5D/route.ts)) drops a
   30-day `pickupvb_ref` cookie (or attributes immediately if already signed in).
   The **auth callback** records the `referrals` row only inside its existing
   "genuinely new account (<60s old)" block, so established hosts who click a ref
   link aren't attributed. `recordReferralAttribution` self-guards: no self-refer,
   one referral per referred user (`unique(referred_user_id)`), and only when the
   referred account has zero events yet.
2. **Milestone.** After a host publishes a **paid** event
   ([events/new/actions.ts](../../apps/web/src/app/events/new/actions.ts)),
   `maybeQualifyReferral` counts their distinct paid events; at ≥3 it flips the
   referral to `rewarded` and inserts the referrer's `pro_grant`. Awaited (so it
   completes before the redirect) but fully self-guarding + best-effort — it never
   breaks event creation.

### Why these knobs

- **Comp over coupon:** simplest, self-contained, works for non-subscribers, and
  reuses the one gate (`hasProBenefits`) every perk already flows through. A
  Stripe coupon only helps active subscribers and adds promo plumbing.
- **≥3 paid events, not signup or 1 event:** rewards real, active organizers and
  resists fake-signup farming. The bar is the referred host doing real work.

## Consequences

- ✅ Referral rewards need zero Stripe integration; the grant unlocks the full
  Pro surface because it rides `hasProBenefits`.
- ⚠️ **`hasProBenefits` widened.** Anything that should respect comps must use it
  (already the convention). A future reader adding a Pro check must not shortcut
  to `isPro`.
- ⚠️ **Attribution is best-effort + first-touch.** Edge: a logged-out established
  host who signs up fresh via a ref link could be attributed; the "<60s new
  account + zero events" guards make this rare, and the ≥3-paid-events bar caps
  payout. Acceptable for v1.
- ❌ No referral leaderboard, no referred-side reward (one-sided), no
  self-serve grant revocation. Deferred.

## References

- [docs/audits/monetization.md § O-3](../audits/monetization.md).
- [apps/web/src/lib/referrals.ts](../../apps/web/src/lib/referrals.ts) /
  [pro-grants.ts](../../apps/web/src/lib/pro-grants.ts) — the mechanism.
- [apps/web/src/lib/admin.ts](../../apps/web/src/lib/admin.ts) — `hasProBenefits`
  honoring grants.
- [ADR 0014](0014-monetization-strategy.md) — Pro strategy; this is a net-new
  acquisition lever, not a price change.
