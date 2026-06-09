# 2026-06-08 — Club tier + group payouts (ADR 0038, monetization O-2)

## Context

O-2: pooled payouts for clubs — the standing payments.md limitation ("every event
pays out to one user; nominate a treasurer"). This is the **highest-risk** bundle
to date because it changes the one thing payments.md says "read before touching":
money routing. Confirmed forks: **paid Club subscription** (the monetization),
**per-event immutable opt-in routing** (the safety choice), **pooled-payouts-only**
v1 (defer multi-admin-Pro + club analytics). Design of record:
[ADR 0038](../adr/0038-group-payouts-club-tier.md) — required by payments.md.

## Decisions

- **Additive, opt-in, immutable-once-sold — so no existing money moves.**
  `events.payout_group_id` defaults null (= `host_id`, byte-for-byte today's
  behavior for every existing + non-opted event). It's set on the event edit page
  only while `isPricingLocked` is false; once a registration is paid the
  destination is frozen, exactly like `host_id`. The migration moves zero money.

- **One resolver, four surgical swaps.** Per-event flows (ticket / team /
  roster-team / tip) now call `getEventPayoutAccount(eventId, hostId)`
  ([lib/event-payout.ts](../../apps/web/src/lib/event-payout.ts)) instead of
  `getHostStripeAccount` directly. Each call site already mapped `null →
"host not ready"`, so the swap was mechanical. **The single most important
  rule:** if a group-routed event's club account isn't `charges_enabled`, the
  resolver returns `null` — it does **not** fall back to the host. Falling back
  would route club money to an individual. The platform `application_fee` is
  untouched (still keys on the host user's tier); Club changes _where_ the payout
  lands, not the fee (halving the fee for admins is the deferred "multi-admin Pro").

- **Separate parallel tables, not a polymorphic owner.** `group_stripe_accounts`
  (mirror of `host_stripe_accounts` keyed by group) and `group_subscriptions`
  (mirror of `host_subscriptions`). Mutating the per-user payout table — the most
  safety-critical one — was rejected. Both are admin-write / owner-admin-read.

- **Reused the host Connect + Pro-subscription machinery wholesale.** Group
  onboarding is `accounts.create` + `accountLinks` tagged
  `metadata.owner_type='group'`, so `handleAccountUpdated` branches and mirrors
  into `group_stripe_accounts`. Club is Stripe Billing (platform account, inline
  `price_data` — no env/Price object), and `handleSubscriptionChange` branches on
  `metadata.kind='club'` into `group_subscriptions`. `is_club_group` carries the
  same M-2 past_due period-end backstop as `is_pro_host`.

- **`/groups/[id]` is the slug, not the UUID** — caught mid-build (the first cut
  assumed UUID and would have 404'd). Group billing actions take the slug, resolve
  the UUID internally for DB ops, and redirect by slug; the edit-panel + group-page
  links use the slug. Worth noting for anything new under `/groups/[id]`.

- **Scope discipline.** Passes + memberships are host-user products and stay
  user-routed (they don't touch the resolver). The event-detail readiness gate
  was deliberately left host-user-keyed: the create flow already requires the
  host user's Stripe before a paid event exists, and group opt-in happens
  post-create, so host-user readiness stays accurate — avoided cache-key churn.

## Surfaces

Migration `20261002000000_group_payouts_club.sql` (`group_stripe_accounts`,
`group_subscriptions`, `events.payout_group_id`, `is_club_group`).
`lib/{group-stripe-account,club,event-payout}.ts`. Group billing
(`groups/[id]/billing/{page,actions}.ts`), event-edit "Club payouts" panel +
`events/[id]/edit/payout-actions.ts`, group-page link. Webhook branches
(`connect.ts` group account, `subscription.ts` club). Four checkout-site resolver
swaps. Hand-edited DB types. Docs: **payments.md** (TL;DR + routing table + the
resolved open limitation + schema rows), **AGENTS Pattern 7** amended, ADR 0038 +
index, features.md, pricing FAQ.

## Deferred

Multi-admin Pro (Club granting Pro perks to admins — would expand the Pro gate's
blast radius); club analytics dashboard; surfacing club payout income in the
(per-user) earnings page; a group-routed event readiness gate that consults the
group account; group payout for passes/memberships.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green (0 lint errors;
all test suites pass; the new `/groups/[id]/billing` route built). Migration
**not** applied locally (deploy-gated). The riskiest paths are unverified against
a real Stripe env: the **Connect destination charge to a group account**, the
group `account.updated` / club-subscription webhook mirroring, and the
opt-in→checkout→correct-destination round-trip. Run these against dev after
deploy before trusting real money to the club path.
