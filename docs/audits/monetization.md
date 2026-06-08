# Monetization audit

**Date:** 2026-05-24
**Scope:** Pricing strategy, Pro tier composition, take-rate posture,
sponsorship surface, infrastructure cost coverage. Pre-launch.

This is a strategy + UX audit, not a code-quality audit. Findings are
graded P1 / P2 / P3 against the rubric in
[docs/audits/README.md](README.md): P1 = should ship before charging
real money for Pro; P2 = next-sprint hardening once we have any user
signal; P3 = opportunistic / post-product-market-fit.

---

## Status — 2026-06-08 — Re-audit (code-quality + stale-code + opportunity pass)

**Trigger:** user-requested monetization audit — find bugs, gaps, improvements,
stale code, **and** new monetization opportunities that align with users
(value-creating, not a tax). First pass with a code-correctness lens layered on
the strategy lens. Since the 2026-05-31 re-eval the following monetization-touching
surfaces shipped: **collectible event badges** ($5/event à-la-carte, Pro-included —
[ADR 0031](../adr/0031-gamification-badges.md)), the capacity **waitlist + auto-promotion**
([ADR 0036](../adr/0036-capacity-waitlist.md)), **free-agent pickup**, the
**leagues container model**, and the receipts/tax ledger — plus two adjacent
code-quality audits already landed: [stripe-integration.md](stripe-integration.md)
and [receipts-tax.md](receipts-tax.md) (both 2026-06-08). This pass does **not**
re-audit Stripe correctness or receipts (those two files own it) — it covers the
monetization-specific surfaces those didn't.

### Headline

- **The revenue engine is still sound; no P1.** $10/mo Pro + 5%/2.5% ticket
  take-rate + 0% tips + host-owned sponsor/badge slots is unchanged and
  defensible ([ADR 0014](../adr/0014-monetization-strategy.md)). Nothing here
  argues to move a price lever.
- **The monetization _surface_ grew (badges) but the strategy docs didn't keep
  up.** The two highest-value findings are documentation drift (M-4, M-5), not
  bugs.
- **One real hardening gap (M-2):** `is_pro_host` trusts the Stripe status
  string with no period-end backstop and treats `past_due` as Pro — an
  indefinite free-Pro leak if Stripe dunning isn't configured to eventually
  cancel.
- **The strongest unbuilt opportunity is the _season pass / multi-session
  punch card_ (O-1)** — a host-priced bundle that wins for the attendee
  (discount + convenience), the host (committed up-front cash, less weekly
  Venmo chasing), and the platform (normal take-rate on a larger transaction).
  It creates value rather than extracting it, which is exactly the brief.

> **Update — 2026-06-08 (same day): all five code/gap findings implemented**
> (uncommitted; the M-2 migration is deploy-gated). M-3 centralized the unlock
> prices in [pro.ts](../../apps/web/src/lib/pro.ts); M-2 added the `is_pro_host`
> period-end backstop migration + the integrations.md dunning note; M-3b
> documented the deliberate non-recording in the webhook; M-4 amended ADR 0014
>
> - marked the stale sections historical; M-5 added payments.md § Platform-direct
>   charges. `pnpm typecheck && lint && test && build` green. The six
>   **opportunities (O-1…O-6) are left open** for a later strategy pass. See the
>   remediation log at the bottom of this file.

### Findings — code / correctness / stale

#### M-2 (P2) — `is_pro_host` grants Pro on `past_due` forever, with no period-end backstop

**File:** [supabase/migrations/20260517000000_pro_subscriptions.sql#L54-L67](../../supabase/migrations/20260517000000_pro_subscriptions.sql#L54-L67)
(never redefined since — confirmed only definition in `supabase/migrations/`).

`is_pro_host(uuid)` returns true for `status in ('trialing','active','past_due')`
and reads **nothing else** — not `current_period_end`, not `trial_end`. The
`past_due` grace is deliberate (Stripe retries ~3 weeks), but the safety of that
grace is **entirely outsourced to Stripe Dashboard dunning config**: if "Manage
failed payments" is set to _leave the subscription past_due_ (a valid setting)
rather than _cancel after retries_, a host whose card permanently fails stays
`past_due` → keeps Pro (unlimited paid events, 2.5% fee, all perks) **forever,
for free**. There is no code-level backstop, and the dependency is undocumented.
A missed final `customer.subscription.deleted`/`.updated` webhook has the same
effect (the row never leaves `past_due`).

**Recommended fix (defense-in-depth, pick one or both):**

1. Add a period-end guard to the grace branch so an abandoned `past_due` row
   self-expires:
   ```sql
   where user_id = p_user_id
     and (
       status in ('trialing','active')
       or (status = 'past_due'
           and current_period_end is not null
           and current_period_end > now() - interval '30 days')
     )
   ```
   This caps the grace at ~30d past the paid period regardless of webhook
   delivery or dunning config.
2. Document the **required** Stripe setting (Settings → Billing → Subscriptions
   → Manage failed payments → "Cancel subscription" after retries) in
   [integrations.md § Stripe](../integrations.md#stripe) and add it to the
   launch checklist, so the ops side of the grace is explicit.

#### M-3 (P3) — À-la-carte unlock prices are duplicated across 6 sites; no single source of truth

**Files:** `SPONSOR_SLOT_UNLOCK_CENTS = 300`
([sponsor-actions.ts#L19](../../apps/web/src/app/events/%5Bid%5D/edit/sponsor-actions.ts#L19)),
`BADGE_SLOT_UNLOCK_CENTS = 500`
([badge-actions.ts#L27](../../apps/web/src/app/events/%5Bid%5D/edit/badge-actions.ts#L27)),
and the **string literals** `"$3"` / `"$5"` hand-typed in
[pricing/page.tsx#L34-L35](../../apps/web/src/app/pricing/page.tsx#L34-L35),
[pricing/page.tsx#L225-L226](../../apps/web/src/app/pricing/page.tsx#L225-L226),
the two FAQ answers ([#L263](../../apps/web/src/app/pricing/page.tsx#L263),
[#L267](../../apps/web/src/app/pricing/page.tsx#L267)), and
[profile/billing/pro/page.tsx#L110](../../apps/web/src/app/profile/billing/pro/page.tsx#L110).

The charge amount lives as a private const in each action file and the
marketing copy re-states the dollar figure as a literal. Bump the sponsor
unlock to $4 and you must remember to edit five copy sites by hand or the
pricing page lies. This is the same drift the audit closed for the _ticket_ fee
by centralizing `PLATFORM_FEE_BPS` / `PRO_PLATFORM_FEE_BPS` in
[pro.ts](../../apps/web/src/lib/pro.ts) / [stripe.ts](../../apps/web/src/lib/stripe.ts).

**Recommended fix:** move both to [pro.ts](../../apps/web/src/lib/pro.ts) next to
`PRO_MONTHLY_PRICE_USD` (e.g. `SPONSOR_SLOT_UNLOCK_CENTS`,
`BADGE_SLOT_UNLOCK_CENTS`), import them in the two action files, and derive the
copy (`$${SPONSOR_SLOT_UNLOCK_CENTS / 100}/event`) in the pricing + Pro pages so
there is exactly one number to change — the discipline ADR 0014 already applies
to the fee rate.

#### M-3b (P3) — Host→PickupVB à-la-carte purchases record no in-app ledger row

**File:** [checkout.ts#L211-L276](../../apps/web/src/lib/webhooks/checkout.ts#L211-L276)
(`sponsor_slot` / `badge_slot` branches).

Every other completed checkout kind (`attendee`, `tip`, `team_registration`,
`roster_team_payment`) calls `recordPaymentAudit(...)` to write a payment-ledger
row. The two à-la-carte unlocks do **not** — they only upsert the
sponsor/badge-access row + fire analytics. So a host who pays PickupVB $3/$5 has
**no in-app record** of that purchase (the host isn't the payee here — PickupVB
is — so it's correctly absent from the host-earnings/receipts surfaces the
receipts-tax audit owns, but there's also no "things I bought from PickupVB"
view). Today the only receipt is whatever Stripe emails from the platform
account if receipt emails are enabled.

**Recommended fix (low priority):** confirm Stripe receipt emails are enabled on
the **platform** account so the host at least gets an emailed receipt; longer
term, if a host "purchase history" surface is ever built, write a lightweight
ledger row here keyed `category: 'sponsor_unlock' | 'badge_unlock'`. Not urgent —
flagged so it's a known gap, not a silent one. Coordinate with
[receipts-tax.md](receipts-tax.md) before adding a ledger category.

### Findings — documentation staleness (the real gaps)

#### M-4 (P2) — This audit + ADR 0014 are stale on the perk set (badges) and the answered open-questions

**Files:** this file (the 2026-05-24 "Today's monetization surface" + "Pro perks
actually shipped" sections, and the unanswered-looking "Open questions" blocks);
[ADR 0014 Consequences](../adr/0014-monetization-strategy.md) ("nine perks as of
Bundle 98").

Drift since 2026-05-31:

- **Collectible event badges** are a live monetization surface ($5/event
  à-la-carte / Pro-included) and appear on the pricing page + comparison table,
  but this audit's "Today's monetization surface" section
  ([§ Pro perks actually shipped](#pro-host-subscription) lists only three) and
  ADR 0014's perk count predate them.
- The **"Open questions (need the user)"** block at the top of the 2026-05-31
  status and the bottom "Open questions for the user" are **fully answered** —
  R-1 (live scoring built), R-3 (bracket cap shipped), R-5 (tips → 0% shipped),
  media (Path A shipped). Reads as open backlog when it isn't.

**Recommended fix:** refresh "Today's monetization surface" to the current perk
set (add badges; note tips are 0%); add a one-line ADR 0014 amendment recording
badges as a perk + the $5/$3 à-la-carte prices; collapse the answered open-question
lists into the remediation log. (This status block is the start of that refresh.)

#### M-5 (P2) — payments.md routing table omits the two platform-direct charge flows

**File:** [docs/payments.md § Payment routing](../payments.md#payment-routing--every-entry-point-goes-through-host_id)
(the routing table lists only ticket / team / tip).

payments.md is explicitly "read this before touching payment routing," and its
table documents the **three Connect destination charges** that flow to
`events.host_id`. It does **not** mention the **two platform-direct charges** that
intentionally bypass host routing entirely:

- **Sponsor slot unlock** ($3) and **badge slot unlock** ($5) — created in
  [sponsor-actions.ts](../../apps/web/src/app/events/%5Bid%5D/edit/sponsor-actions.ts) /
  [badge-actions.ts](../../apps/web/src/app/events/%5Bid%5D/edit/badge-actions.ts)
  with **no `transfer_data.destination`**, so the money lands in PickupVB's own
  account and **no host Connect onboarding is required** (a free host with zero
  Stripe setup can still buy an unlock). This is correct and deliberate, but a
  reader of payments.md would not know these flows exist or that they're
  routing-exempt.
- The **Pro subscription** itself (Stripe Billing, platform account) is likewise
  absent.

**Recommended fix:** add a short "Platform-direct charges (not host-routed)"
section to payments.md listing the sponsor/badge unlocks + Pro subscription,
stating explicitly that they charge the platform account, take no
`application_fee`/destination, and require no host Connect account — so a future
agent doesn't "fix" them by adding destination routing.

### Opportunities — value-aligned, not extractive (strategy / P3)

The user asked specifically for monetization that _creates value for users
rather than taxing them_. Ranked by alignment × reachability at 2–3 metros.
None of these violate the "What NOT to do" list below.

#### O-1 (strongest) — Season passes / multi-session punch cards — ✅ Shipped 2026-06-08 ([ADR 0037](../adr/0037-season-passes.md))

**Built** the v1 vertical: a Pro host sells a prepaid credit pack
(`host_passes`); a buyer purchases it as a destination charge to the host
(`pass_purchases`, tiered platform fee); the host flags open-play events
`accepts_pass_credits`; the buyer redeems a credit to claim a spot via the
atomic `redeem_pass_credit` SECURITY DEFINER RPC (capacity trigger fires, no
Stripe charge); cancelling returns the credit automatically (participant-delete
cascade → `event_participant_payments` delete trigger decrements `credits_used`).
Surfaces: host management page (`/profile/billing/passes`, Pro-gated), event-edit
opt-in, event-detail buy/redeem `PassPanel`, buyer `/profile/passes`, pricing
copy. Pure helpers unit-tested (`pass-helpers.test.ts`); migration
`20260930000000_season_passes.sql` (deploy-gated). **Deferred follow-ups:** pass
income into the global earnings page / tax CSV (blocked on the
`event_payment_audit.event_id` NOT NULL constraint — coordinate with
[receipts-tax.md](receipts-tax.md)); a buyer-paid platform-fee line (v1 has the
host absorb it); a post-purchase confirmation banner (the PassPanel balance is
the current feedback); per-event refund-window nuance on credit return (v1
returns the credit on any pre-event cancel). Rationale write-up retained below.

**Original opportunity (rationale):**

A host sells a **bundle** — "10-session open-play punch card," "league season
pass," "monthly membership" — at a host-set discount vs. drop-in. PickupVB takes
its **normal ticket take-rate** on the (larger, up-front) transaction; no new
fee, no new tax.

- **Attendee wins:** lower per-session price + one payment instead of chasing a
  Venmo every week.
- **Host wins:** committed revenue up front, dramatically less weekly payment
  admin (the #1 pain the off-platform upsell already targets), predictable
  attendance.
- **Platform wins:** larger transactions at the same rate, deeper lock-in to
  on-platform payments (pulls Venmo hosts onto Stripe — the exact goal of the
  Bundle-100 off-platform upsell), and a natural Pro hook (e.g. pass management
  / auto-renew as a Pro capability).
- **Shape:** a `passes` / `pass_purchases` model; redemption decrements a balance
  at check-in (the check-in flow already exists). Per-player only (no team-mode
  complexity v1). Probably 2–3 bundles; an ADR first. **This is the highest-value
  net-new monetization surface and the most community-aligned.**

#### O-2 — Club / Group tier with pooled payouts ("PickupVB Club") — ✅ Shipped 2026-06-08 ([ADR 0038](../adr/0038-group-payouts-club-tier.md))

**Built** the v1 vertical (pooled payouts only). A group subscribes to **Club**
(~$25/mo, Stripe Billing on the platform — `group_subscriptions`,
`is_club_group`), connects its **own** Stripe Connect account
(`group_stripe_accounts`, onboarding mirrors the host flow, `owner_type='group'`
metadata routes the `account.updated` webhook), and opts group-hosted events to
pay out to the club via `events.payout_group_id`. The three per-event flows
(ticket/team/tip + roster-team) resolve through `getEventPayoutAccount` — group
account if opted-in, else host; **never falls back to host** if the club account
isn't ready; routing frozen once a registration is paid (`isPricingLocked`);
existing/non-opted events unchanged; the platform fee still keys on the host
user. Surfaces: `/groups/[slug]/billing` (subscribe + connect), event-edit "Club
payouts" panel, group-page link. Migration `20261002000000` (deploy-gated).
**Deferred (per scope):** multi-admin Pro, club analytics, club payout income in
the per-user earnings page. payments.md + AGENTS Pattern 7 amended (the "no group
payouts" limitation is resolved). Original rationale below.

**Original opportunity (rationale):**

Resolves the standing limitation in
[payments.md § Open question](../payments.md#open-question--known-limitation):
there is no group-owned payout account. A paid **Club** tier (above individual
Pro) could offer (a) a group-owned Stripe Connect destination so club admins
share payouts without nominating a personal "treasurer," (b) multiple Pro-enabled
admins under one subscription, (c) club-level analytics across all the club's
events. Captures more value from the **highest-value persona** (the club running
leagues — exactly the leagues-container work that just shipped) **without taxing
casual hosts**, who never need it. Schema + routing work is non-trivial (the
payments.md open-question spans `group_stripe_accounts`, a payout-owner column,
and every routing site) — needs an ADR before any code. Reconsider once a launch
metro has a multi-admin club running a league.

#### O-3 — Referral credit (carry-over of P3 #10)

A host who refers another host that publishes ≥3 paid events earns 1 free month
of Pro. Standard PLG; rewards advocacy rather than extracting from users. Still
deferred until the trial-conversion baseline exists (the funnel is now
instrumented — Bundle 98), but it's the cheapest growth lever once there's a
denominator to measure against.

#### O-4 — Convert harder on levers already shipped (no new product)

- **Cap-hit upgrade nudge:** the ADR-0014 thesis is that the _second paid event
  in 30 days_ is the upgrade trigger. The block exists
  ([host-paid-event-cap.ts](../../apps/web/src/lib/host-paid-event-cap.ts) returns
  a `cta`), but it fires only at the moment of rejection. Consider a proactive
  "you've used your 1 free paid event — Pro is unlimited" banner on the host
  dashboard _before_ they hit the wall. Pure conversion, zero new cost to users.
- **Annual-default framing (carry-over P3 #8):** annual is undersold as an
  equal-weight button. For a new product annual is worth more (lower churn);
  worth A/B-ing the default once there's a framework. No user cost.

#### O-5 — SMS as a Pro perk when Twilio lands (carry-over R-4 / P3 #11)

Unchanged: SMS has real per-message cost (~$0.008 US) and is the cleanest "Pro
pays for what it costs us" lever. Decide gating **in** the SMS bundle (Pro-only
or low free quota), not free-first-then-clawback.

#### O-6 (flag — lean NO) — Platform "featured event" boost

A host-paid "feature my event at the top of `/events?metro=…`" placement is the
obvious next ask, and there is **no featured/boost surface today** (confirmed —
nothing in the events tree). But it sits uncomfortably close to the
ADR-0014-rejected "platform-sold discovery advertising": it degrades discovery
quality (pay-to-win ordering) and once one host pays for the top slot, ranking
decisions are partly defended on boost revenue. **Recommendation: don't ship
pre-launch.** If ever revisited, gate it hard — clearly labeled "Promoted,"
host-paid (never platform-sold third-party), capped at one per metro page, and
never on the event-detail page. The host-owned **sponsor slot** already captures
the community-safe version of "host pays to promote their thing."

#### O-7 — Recurring memberships (Phase 2 of O-1) — ✅ Shipped 2026-06-08 ([ADR 0037 Phase 2](../adr/0037-season-passes.md))

**Built** the recurring sibling of season passes: a Pro host sells a **monthly
membership** (`host_membership_plans`); a buyer subscribes via a **Connect
destination subscription** (Stripe `mode: 'subscription'`, `transfer_data` to the
host + tiered `application_fee_percent` — the first recurring host-routed flow);
while their `host_memberships` row is active (`is_active_member`, with the M-2
past_due backstop) they **claim free spots** on the host's `accepts_pass_credits`
open-play events via the `claim_membership_spot` RPC (no charge, unlimited).
Subscription state mirrors from the `customer.subscription.*` webhook
(`metadata.kind = 'host_membership'`, branched off the Pro path); cancel is
`cancel_at_period_end` via the Stripe API. Surfaces: host management
(`/profile/billing/memberships`), the extended event `PassPanel` (member-claim
takes precedence over credits), buyer `/profile/passes` (cancel), pricing copy.
`membership-helpers.test.ts` unit-tested; migration `20261001000000` deploy-gated.
**Deferred:** annual interval; credit-refill variant; membership income in the
earnings page / tax CSV; buyer-paid platform fee.

#### O-8 / O-9 (catalogued, not started) — white-label event branding · waiver e-sign

Surfaced in the 2026-06-08 opportunity review and recorded so they aren't lost:
**O-8** — Pro-host custom event-page branding (logo/colors), a low-cost vanity
perk that doesn't touch the attendee's wallet; **O-9** — per-event waiver /
liability e-sign (Pro capability or à-la-carte unlock like the sponsor/badge
slots), a real organized-tournament need. Both are net-new feature builds, not
quota tweaks. Not yet scoped.

### Reaffirmed — the engine and the guardrails still hold

The "What NOT to do" list below (no platform-sold ads, no clawback of free
features, no chat/DM paywall, no per-metro price discrimination, no churning the
$10 / 5% / 2.5% levers pre-launch) is unchanged and reaffirmed. ADR 0014's
success-criteria triggers remain the only sanctioned reason to move price.

---

## Status — 2026-05-31 — Re-evaluation (post chat / media / live-scoring / MapTiler)

**Trigger:** a week of feature shipping since the 2026-05-24 audit — chat /
messaging ([ADR 0028](../adr/0028-chat-messaging.md)), event + profile media
([ADR 0024](../adr/0024-event-and-profile-media.md)), avatars / profile
pictures, broadcast notifications ([ADR 0027](../adr/0027-realtime-broadcast-notifications.md)),
standalone brackets ([ADR 0025](../adr/0025-standalone-brackets.md)), and the
MapTiler cutover ([TPI-1/3](third-party-integrations.md)) — changed the **cost**
side of the ledger without adding revenue. Re-evaluated against the user ask:
cover server + third-party costs and turn a profit **without** taxing the
community.

### Headline

- **Every feature shipped since 2026-05-24 is a cost center, not a revenue
  center.** Chat, media galleries, avatars, live scores, broadcast
  notifications, and MapTiler are engagement / retention / community plays.
  That's the right call — but it means the revenue engine (Pro + take-rate +
  host sponsor slot) now covers a **bigger base**.
- **The engine itself is sound and doesn't need re-pricing.**
  [ADR 0014](../adr/0014-monetization-strategy.md) locks $10/mo + 5%/2.5%
  pre-launch with measurable revisit triggers; nothing here argues to move
  those levers. The lever to pull is **Pro conversion**, not Pro price.
- **Correction (2026-06-01): the perk we flagged as "the highest-ROI unbuilt
  move" — live match scoring — is in fact already built.** ADR 0023's phases
  1–5 all shipped 2026-05-30 (domain `LiveMatchScore`, `match_live_scores`
  migration + RPC, application handlers + finalize mappings, infra adapter, the
  Pro-gated `ScoreLiveButton`, and the public live-view island). The original
  bullet relied on the ADR's stale "Proposed" status and a stale memory note.
  The conversion lever **exists**; the only remainder is the Phase-6 realtime
  e2e on a deployed env. See R-1 below.

### Revised cost floor

The 2026-05-24 floor (~$70–110/mo pre-Twilio) predates three new cost
surfaces:

| New since 2026-05-24                                                                        | Cost driver                                                                                                                                                                                                                          | Posture                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MapTiler** (geocoding + tiles, [integrations.md § MapTiler](../integrations.md#maptiler)) | Per-request: autocomplete on every event-create + tiles on every event-detail map. Free tier (~100k tile loads/mo) is fine at 2–3 metros; paid (~$25–30/mo) once tiles / geocoding scale.                                            | Pure infra — covered by blended take-rate + Pro, **not** a new paywall.                                                                                                           |
| **Supabase Realtime** (chat DMs / rooms, live scores, broadcast bell)                       | Concurrent peak connections (= active tabs) + messages/mo. Named the "single biggest concurrent-connection + cost lever" in [TPI-7](third-party-integrations.md). Within Pro's ~500-conn / 5M-msg base at launch; usage-based after. | Absorbed by Supabase Pro base until scale. Watch concurrent-conn growth as chat adoption rises.                                                                                   |
| **Supabase Storage + egress** (media, avatars, chat attachments, sponsor logos, hero)       | Egress on every image view is the real lever (100GB storage / 250GB egress in Pro, then $0.021/GB + $0.09/GB).                                                                                                                       | Retention sweeps already mitigate ([chat retention](../../supabase/migrations/20260829000000_chat_retention.sql), hero/sponsor orphan walkers). Tier **volume** on Pro (see R-2). |

**Revised floor ≈ $95–140/mo** at launch (old floor + MapTiler + a small
Realtime / Storage usage buffer), still pre-Twilio. Break-even shifts modestly:
**~12–15 Pro subs OR ~$2–2.8k GMV/mo** clears it — still very reachable for
2–3 metros. But the grown base is the reason the conversion-side findings below
matter more than they did a week ago.

### New findings

#### R-1 (P1) — Live-scoring Pro perk — ✅ already built; only e2e remains (corrected 2026-06-01)

**File:** [ADR 0023](../adr/0023-live-match-scoring.md) (status corrected to
Accepted/implemented 2026-06-01); gate at `isPro(event.hostId)`
([pro.ts](../../apps/web/src/lib/pro.ts)).

**Correction:** this was filed as "the strongest unrealized conversion lever …
unbuilt." It is in fact **built and integrated.** ADR 0023 phases 1–5 all
shipped 2026-05-30 — domain `LiveMatchScore`
([packages/domain/src/scoring/](../../packages/domain/src/scoring/)), the
`match_live_scores` table + `upsert_match_live_score` / `clear_match_live_score`
RPCs ([20260815000000_match_live_scores.sql](../../supabase/migrations/20260815000000_match_live_scores.sql)),
application handlers + finalize mappings
([live-match-score.handler.ts](../../packages/application/src/commands/live-match-score.handler.ts),
[live-match-finalize.ts](../../packages/application/src/scoring/live-match-finalize.ts)),
the Supabase adapter, the Pro-gated `ScoreLiveButton`
([score-live-button.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/score-live-button.tsx)),
and the public live-view island
([live-scores-provider.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/live-scores-provider.tsx)).
DB types reconciled; `pnpm typecheck` green (15/15). The line is drawn exactly
where ADR 0014 says — manual scoring free for everyone, the live auto-saving
scoreboard is the Pro perk.

**Remaining (Phase 6 only):** runtime/e2e verification of the realtime
round-trip (score → public live update → finalize) on a deployed env — no
`score-live` Playwright spec exists yet. Optional polish: an upgrade prompt for
non-Pro hosts on the "Score live" affordance (currently the button simply
doesn't render for non-Pro). **The conversion lever already exists in the
product.**

#### R-2 (P2) — Media/storage volume — ⚠️ premise corrected 2026-06-01; no clean Pro paywall exists

**File:** [ADR 0024](../adr/0024-event-and-profile-media.md) (media);
chat attachments ([ADR 0028](../adr/0028-chat-messaging.md)).

**Correction:** R-2 assumed "media galleries" store image bytes worth metering.
They don't. The actual storage/egress map:

- **ADR 0024 media (videos/clips/streams) = external links** (YouTube/Twitch
  URLs) — the platform "hosts nothing," so it costs ~$0. Metering it would tax
  free community content for no savings.
- **Avatar / hero / sponsor logo = one upload each** (10 / 8 / 4 MB caps). No
  "volume" to tier.
- **Chat attachments = the only real byte-volume surface** (10 MB × 10/message,
  image-only, bucket-enforced) — but chat is a **community surface** (DMs/team
  rooms). Our own do-not list forbids a chat/DM paywall, and the buyer persona is
  the host, not the chatter, so a Pro gate there is both community-hostile and
  persona-mismatched.

So a straight "Pro media quota" has no community-safe home. Two honest paths
were put to the user:

- **Path A — cost-control, not monetization. ✅ Shipped 2026-06-01 (user chose
  this).** Keep media free/uncapped-by-tier; bound cost with _universal_ limits +
  the retention sweeps already shipped ([chat retention](../../supabase/migrations/20260829000000_chat_retention.sql),
  hero/sponsor orphan walkers). Shipped a **per-user chat-attachment upload cap**:
  ≤ 40 attachment-bearing messages / rolling 24h, enforced in `sendChatMessage`
  ([chat-actions.ts](../../apps/web/src/app/_actions/chat-actions.ts)) via the
  existing fail-open `consumeRateLimit` limiter; text chat is never throttled.
  `rateLimitKey` gained a hashed `'user'` dimension. Bounds runaway / abuse
  upload volume without taxing the community or paywalling a chat surface. No Pro
  gate, no migration.
- **Path B (NOT chosen) — build a net-new host feature worth gating.** Nothing
  today fits, so the community-safe option would be a _new additive_ host
  capability, e.g. an **event photo gallery** (hosts upload recap photos —
  doesn't exist today). Free ~15 photos/event; Pro ~150 + clips; viewing always
  free. A **feature build, not a quota tweak** — 1–2 bundles. Held until there's
  a real signal hosts want photo uploads; revisit then as a feature decision.

#### R-3 (P2) — Standalone brackets as a Pro / à-la-carte surface — ✅ Shipped 2026-06-01

**File:** [ADR 0025 addendum](../adr/0025-standalone-brackets.md#addendum-2026-06-01-free-tier-active-bracket-cap-monetization-r-3).

The in-event bracket generator stays free (no clawback per ADR 0014). Shipped the
free cap on the **net-new standalone surface**: Free hosts run **1 active
(non-completed) standalone bracket at a time**; Pro unlimited. Completed brackets
don't count, so a Free host keeps their history and only an in-progress bracket
occupies the slot. `validateActiveBracketCap`
([standalone-bracket-cap.ts](../../apps/web/src/lib/standalone-bracket-cap.ts),
unit-tested) mirrors the paid-event cap (Pro/admin short-circuit, else count
`listByOwner` non-completed rows); enforced in the create action and surfaced as
a proactive upgrade card on `/brackets/new`. Pricing / features copy updated.

#### R-4 (P3 → promote on Twilio) — Reaffirm SMS-as-Pro when Twilio lands

Carries over [P3 #11](#11-sms-as-a-pro-perk-when-twilio-lands). SMS is the
clearest "Pro pays for what it costs us" lever (real per-message cost ~$0.008
US). Decide gating **in** the SMS bundle (Pro-only or low free quota) so it
isn't shipped free-first then clawed back.

#### R-5 (P3) — Tip-jar fee posture as a trust signal — ✅ Shipped 2026-06-01 (dropped to 0%)

Carries over [P3 #9](#9-tip-jar-take-rate-parity-with-tickets-is-probably-wrong).
**Decision: drop the tip fee to 0% on every tier** (not a cap — a clean "we take
nothing on tips" is the stronger, more marketable signal). Ticket fees unchanged.
`tipPlatformFeeCents()` returns 0
([event-pricing.ts](../../apps/web/src/lib/event-pricing.ts), unit-tested);
[tip-actions.ts](../../apps/web/src/app/events/%5Bid%5D/tip-actions.ts) stores
`platform_fee_cents = 0`;
[checkout-session.ts](../../apps/web/src/lib/checkout-session.ts) omits
`application_fee_amount` when 0 so the destination charge transfers the full tip.
Pricing / Pro / tip-jar copy and the [ADR 0014 amendment](../adr/0014-monetization-strategy.md)
record it. Stripe's processing fee still applies (it's Stripe's, not ours) and
the tip UI says so. P3 #9 closed.

### What NOT to do (community protection — reaffirmed)

- **No platform-sold display ads** on event / group / home pages (ADR 0014).
- **No clawback** of existing free features — co-hosts, groups, broadcasts,
  in-event brackets, basic chat / DMs.
- **No chat / DM paywall.** Messaging is community infrastructure and a
  retention driver; monetize the host toolkit _around_ it, never the
  conversation.
- **No per-metro price discrimination** (ADR 0014 rejected).
- **Don't churn** the 5%/2.5% take-rate or the $10 price pre-launch — ADR
  0014's success-criteria triggers are the only sanctioned reason to move them.

### Open questions (need the user)

1. **Live scoring (R-1)** — green-light to build as the next Pro perk?
2. **Media tiering (R-2)** — comfortable giving Pro higher media limits / video
   with a generous free photo quota, or keep all media uncapped-free for now
   (pure cost)?
3. **Tip fee (R-5)** — keep 5%/2.5% on tips, or drop / cap it as a trust signal?
4. **Standalone brackets (R-3)** — OK to introduce a free cap (1 active) with
   Pro unlimited on the new standalone surface?

---

## Feature status

Quick-reference table. Detailed findings follow below.

| Feature                                     | Priority | Status     | Bundle                |
| ------------------------------------------- | -------- | ---------- | --------------------- |
| Stripe processing fee passthrough           | P1 #2    | ✅ Shipped | Bundle 83             |
| Host-owned sponsor slot (Pro included)      | P2 #4    | ✅ Shipped | Bundle 84             |
| Sponsor slot à-la-carte ($3/event for Free) | P2 #4    | ✅ Shipped | Bundle 85             |
| Saved event templates                       | P1 #1    | ✅ Shipped | Bundle 86             |
| Host analytics dashboard                    | P1 #1    | ✅ Shipped | Bundle 87             |
| Custom refund policy gating                 | P1 #1    | ✅ Shipped | Bundle 98             |
| Invite-only / private events                | P1 #1    | ✅ Shipped | Bundle 99             |
| Trial-to-paid conversion tracking (PostHog) | P2 #5    | ✅ Shipped | Bundle 98             |
| Off-platform event upsell                   | P2 #7    | ✅ Shipped | Bundle 100            |
| Monetization strategy ADR                   | P1 #3    | ✅ Shipped | Bundle 98             |
| Metro-level sponsorship inventory           | P2 #6    | ⏸ Deferred | until ≥1 active metro |

---

## TL;DR

- **Pro is now a feature product, not just a discount.** As of Bundle 87,
  Pro ships nine perks: unlimited paid events, half the platform fee,
  saved event templates, host analytics dashboard, sponsor slot included,
  custom refund policy, invite-only/private events, CSV attendee export,
  and 14-day free trial. The three perks present at audit time have grown
  to a full host toolkit. The fee-savings break-even (~$400/mo GMV) is now
  a floor, not a ceiling — hosts below that threshold have feature reasons
  to upgrade.
- **All P1 sub-items shipped.** With Bundle 99 closing invite-only /
  private events, Pro now ships every feature its pricing page
  advertises. The fee-savings break-even (~$400/mo GMV) is a floor,
  not a ceiling — hosts below that threshold have feature reasons
  to upgrade.
- **Take-rate is generous and should stay that way.** 5% free / 2.5%
  Pro is competitive with Eventbrite's 3.7%+$1.79 and well below
  Meetup's $24/mo flat. Holding the line is a trust-building moat;
  don't touch this lever pre-launch.
- **Third-party per-event ads: still don't ship.** The host-owned sponsor
  slot (now live) is the correct shape — PickupVB never rents the
  inventory, the host does. The positioning holds.
- **Cover-cost math is reachable.** Vendor floor is ~$70–$110/mo
  pre-Twilio. **~10–12 Pro subs OR $1.4–2.2k of monthly GMV
  through the platform** clears infra.

---

## Today's monetization surface (the factual picture)

> **Historical snapshot (2026-05-24/27).** The sections below predate the
> collectible-badges surface and the tips→0% change. The **current** monetization
> surface — Pro perk set incl. collectible event badges ($5/event à-la-carte /
> Pro-included), sponsor slot ($3/event à-la-carte / Pro-included), 0% tips, and
> the centralized à-la-carte prices in `lib/pro.ts` — is summarized in the
> [2026-06-08 re-audit status block](#status--2026-06-08--re-audit-code-quality--stale-code--opportunity-pass)
> at the top of this file (M-3 / M-4). The Pro perk list is authoritatively the
> one rendered on the pricing page.

### Pro Host subscription

Set in [apps/web/src/lib/pro.ts#L17-L22](../../apps/web/src/lib/pro.ts#L17-L22):

- **$10/month or $100/year** ($20/yr savings on annual)
- **14-day free trial**, Stripe-billed
- Trial / active / past_due all read as Pro
  ([20260517000000_pro_subscriptions.sql#L51-L65](../../supabase/migrations/20260517000000_pro_subscriptions.sql#L51-L65))

**Free tier cap:** 1 paid event per rolling 30 days
([pro.ts#L22](../../apps/web/src/lib/pro.ts#L22)). Free events are
unlimited.

**Pro perks actually shipped** (the pricing page lists three —
[pricing/page.tsx#L38-L45](../../apps/web/src/app/pricing/page.tsx#L38-L45)):

1. Unlimited paid events.
2. Platform fee 5% → 2.5% on tickets + tips.
3. CSV attendee export with payment status.

That's it. The "Everything in Free" bullet is filler.

### Platform fee on payments

[apps/web/src/lib/stripe.ts#L42](../../apps/web/src/lib/stripe.ts#L42) +
[apps/web/src/lib/event-pricing.ts#L82-L85](../../apps/web/src/lib/event-pricing.ts#L82-L85):

| Tier | Tickets | Tips | bps |
| ---- | ------- | ---- | --- |
| Free | 5%      | 5%   | 500 |
| Pro  | 2.5%    | 2.5% | 250 |

- **Buyer-paid** (default): attendee sees `price + platform fee` line items.
- **Host-absorbs**: optional toggle; fee comes off host payout.
- **Stripe processing (~2.9% + $0.30)**: always off host payout, never
  passed to buyer today.
- **Off-platform mode** (`events.payments_off_platform = true`): zero fee.

### What is _not_ monetized

- **Groups** — 100% free. No group-level Pro tier; no group-owned
  Stripe account (per-user only — [docs/payments.md](../payments.md)).
- **Bracket / round-robin generator** — Pro-grade tournament tool;
  shipped free.
- **Co-host slots** — unlimited; free.
- **Push, SMS (when wired), email reminders** — free.
- **Public marketing surfaces** — `/about/numbers`, every event page,
  every group page: no ad slot, no sponsor block, no schema.

---

## Unit economics — the numbers

Conservative, pre-launch. Anywhere a number is a vendor list price I
link to it being absent from the repo so we know it needs to be
confirmed against the actual invoice.

### Per-Pro-subscriber

Pro at $10/mo, billed through Stripe Billing. Stripe Billing
processing fee = standard card (2.9% + $0.30) + Billing surcharge
(0.5%) ≈ 3.4% + $0.30.

```
Gross:               $10.00
Stripe fee:        -  $0.64
─────────────────────────────
Net per Pro sub:     $ 9.36 / month
```

Annual plan ($100/yr) nets ~$96.10/year amortized ≈ $8.00/mo. **The
monthly plan is the better-paying acquisition** until churn dynamics
emerge.

### Per ticket sold (5% buyer-paid free tier, $20 ticket)

```
Buyer pays:                $21.00 ($20 + $1 platform fee)
Stripe fee (2.9%+$0.30):  - $0.91
application_fee → us:      $1.00
Host receives:             $19.09
PickupVB nets:             $1.00
```

At **5% take-rate on $20 tickets we net $1/ticket.** Linear with
price; halve it for Pro hosts.

### Pro vs Free break-even on the fee discount alone

Pro saves 2.5% of GMV; costs $10/mo. Break-even is **GMV ≥ $400/mo**.

- A host running one $20 × 12-person open play per week clears $960/mo
  GMV → Pro saves them $24/mo on fees, net $14/mo win after the $10
  sub.
- A host running one $30 × 16-player tournament per month clears
  $480/mo GMV → Pro saves $12/mo on fees, net $2 win.
- A host running occasional sub-$400/mo events buys Pro for the
  _features_ or not at all. **This is the cohort the Pro feature set
  must earn.** Today the feature set does not earn it.

### Cover-cost target (vendor floor)

None of these are visible in the repo as a real invoice — list-price
estimates only, marked as such. Confirm against actual Vercel /
Supabase / etc. dashboards.

| Vendor                  | Plan assumption  | Monthly       | Notes                                                                                                                                         |
| ----------------------- | ---------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Pro            | $25 base         | $25           | + usage when we exceed free Auth MAU + 8GB db                                                                                                 |
| Vercel Pro              | $20/seat         | $20           | + bandwidth/build minutes over free                                                                                                           |
| PostHog                 | Free             | $0            | free up to 1M events/mo per [docs/integrations.md#L167-L198](../integrations.md#L167-L198)                                                    |
| Sentry Team             | $26              | $26           | required for source maps + replay                                                                                                             |
| Resend                  | $20 / 50k emails | $0–$20        | $0 free tier; $20 needed once ~3k emails/mo                                                                                                   |
| Email (Zoho Mail Lite)  | $1/mailbox       | ~$1           | Inbound support mailboxes via catch-all (added 2026-06-03); see [integrations.md § Email hosting](../integrations.md#email-hosting-zoho-mail) |
| Cloudflare Turnstile    | Free             | $0            |                                                                                                                                               |
| Domain + misc           |                  | ~$1           |                                                                                                                                               |
| **Floor (pre-Twilio)**  |                  | **~$70–$110** |                                                                                                                                               |
| Twilio SMS (when wired) | $0.0083/SMS      | variable      | 1000 SMS = $8.30                                                                                                                              |

To clear the floor at ~$90/mo through **Pro alone**: ~10 Pro subs at
$9.36 net = $93.60. To clear it through **take-rate alone**: $1,800
GMV at 5% = $90. To clear floor + a $500/mo gross margin: ~64 Pro
subs OR $12k monthly GMV OR a blend.

### Sponsorship — what's realistic at this stage

For reference, **not** because we should ship per-event ads today:

- Local newsletter sponsor slots in niche verticals: $50–$500/mo.
- Direct-sold metro-sports sponsorships (one sponsor per metro on a
  metro landing page): $50–$200/mo per active metro.
- Programmatic CPM in the sports vertical: $5–$15 CPM — we don't
  have the traffic to make this worth the UX cost.

The first viable sponsorship is **metro-level direct-sold**, not
per-event programmatic. See P2 #6 below.

---

## P1 — should ship before charging real money for Pro

### 1. Pro feature set doesn't earn $10/mo for sub-$400-GMV hosts

> **Status (2026-05-27, Bundle 99): SHIPPED.**
> Sub-items #1 (templates, Bundle 86), #2 (analytics, Bundle 87),
> #3 (custom refund policy gating, Bundle 98), and #4 (invite-only
> / private events, Bundle 99) are live. Sub-item #5 (co-host
> gating) was explicitly dropped 2026-05-24. P1 #1 is closed.

**File:** [apps/web/src/app/pricing/page.tsx#L38-L45](../../apps/web/src/app/pricing/page.tsx#L38-L45),
[apps/web/src/lib/pro.ts](../../apps/web/src/lib/pro.ts).

**Category:** product / pricing.

Pro today is a **discount product**, not a **feature product**. The
fee-savings break-even is $400 of monthly GMV; below that, a host is
buying Pro out of charity or for the CSV export. The pricing page
itself calls out only three benefits and one of them is "everything
in Free." First-time hosts who run a single bi-weekly open play (the
modal launch user) won't clear the threshold for months.

**Recommended fix:** add **2–3 host-side features that have nothing
to do with fees**. None of these touch the attendee experience.
Ranked by build cost vs perceived value:

1. **Saved event templates** — host creates a template ("Tuesday
   open play"); one click publishes the next occurrence with new
   date. High value for any serial host. Schema: new
   `event_templates` table referencing the same fields as `events`
   minus `start_at` / `end_at`. Small UI under
   [apps/web/src/app/events/new/](../../apps/web/src/app/events/new/).
   **Estimate: 1 bundle.**
2. **Host analytics dashboard** — per-event fill rate, no-show
   rate, repeat-attendee rate, GMV trend. Read-only page reusing
   the analytics-capture data already flowing into PostHog (Bundle 80) plus direct Supabase reads for attendee data. Pro-only.
   **Estimate: 1–2 bundles.**
3. **Custom refund policy** — Free hosts get the 24h default; Pro
   hosts can configure custom (1h–720h). Schema already permits
   720h max; just gate the UI. **Estimate: half a bundle.**
4. **Invite-only / private event** — flag on event; doesn't appear
   in `/events` listing; accessible only via direct link or invite.
   Useful for league play and friend groups; pure host capability.
   **Estimate: half a bundle.**
5. **Co-host invite cap** — Free = 1 co-host, Pro = unlimited.
   _Caveat:_ the co-host feature exists today and is uncapped, so
   this is a takeaway from existing free users. **Decision
   (2026-05-24): not pursuing.** Pro will be fattened by net-new
   features only; no clawback from existing free users.

Ship **#3** as the next monetization bundle. That moves
Pro from "tax break" to "host operating system" — the framing the
pricing page already wants to make.

### 2. Stripe processing fee is silently absorbed by host

> **Status (2026-05-24, Bundle 83): SHIPPED.** New
> `events.pass_processing_fee_to_buyer` column defaults `true` for
> new events; existing rows backfilled `false`. Three checkout-action
> paths emit a "Processing fee" line; create + edit forms expose the
> toggle (gated by `host_absorbs_fee` and by `isPricingLocked`).
> See [docs/journal/2026-05-digest.md#bundle-83](../journal/2026-05-digest.md#bundle-83).

**File:** [apps/web/src/lib/event-pricing.ts](../../apps/web/src/lib/event-pricing.ts),
[apps/web/src/lib/checkout-session.ts](../../apps/web/src/lib/checkout-session.ts).

**Category:** host trust / revenue clarity.

A host who lists a $20 ticket today nets $19.09 in buyer-paid mode
because Stripe takes $0.91 off their payout. Hosts notice this on
the very first payout and it feels like a hidden tax — they
advertised $20, they expected the $1 platform fee, they didn't
expect to net $19.

Eventbrite and ClubExpress both pass the processing fee to the
buyer as a separate line. **Doing the same makes the host's
expected payout match the ticket price** and costs the attendee
~$1/ticket. The attendee already expected service fees from any
ticketing platform; this is a low-friction UX trade for a high-
trust host win.

**Recommended fix:** add `pass_processing_fee_to_buyer` boolean on
events (default `true` going forward, `false` for existing). When
true, the Checkout Session line items include a
`Processing fee — $0.91` line computed as `ceil((subtotal \* 0.029)

- 30. cents`. When false, behavior is today's.

Schema migration + change to
[apps/web/src/lib/event-pricing.ts](../../apps/web/src/lib/event-pricing.ts)

- a sentence in
  [docs/payments.md](../payments.md). **Estimate: 1 bundle.**

This is **revenue-neutral for PickupVB** but is the single biggest
host-trust signal we can ship cheaply.

### 3. No Pro decision is documented in ADRs or journal

> **Status (2026-05-27, Bundle 98): SHIPPED.** ADR
> [0014-monetization-strategy.md](../adr/0014-monetization-strategy.md)
> records the $10/mo / 50% fee discount / 1-paid-event-per-30d /
> 14-day-trial decisions with rationale, rejected alternatives,
> and explicit success-criteria triggers for revisiting. Journal
> entry: [docs/journal/2026-05-digest.md#bundle-98](../journal/2026-05-digest.md#bundle-98).

**File:** [docs/adr/](../adr/) — no `0NNN-pro-tier.md`;
[docs/journal/](../journal/) — no monetization rationale entry.

**Category:** documentation / strategy.

Pro shipped in migration
[20260517000000_pro_subscriptions.sql](../../supabase/migrations/20260517000000_pro_subscriptions.sql)
without an ADR or journal entry explaining (a) why $10/mo not $5 or
$15, (b) why a 50% fee discount vs flat fee elimination vs no
discount, (c) why the free-tier cap is 1 paid event/30d not 0 or 3,
or (d) what success looks like (target trial-to-paid %, target Pro
share of hosts).

**Recommended fix:** ADR `00NN-monetization-strategy.md` recording
the current decisions + the rationale for not raising the
platform-fee ceiling pre-launch + the criteria that would cause us
to revisit. Journal entry the next time pricing moves. ADRs are the
mechanism in this repo for "why we picked this number" so future-us
doesn't churn the lever based on a bad week.

---

## P2 — next-sprint hardening once any user signal exists

### 4. Host-owned sponsor slot (the answer to the sponsorship question)

> **Status (2026-05-24, Bundle 85): SHIPPED (v1 + a-la-carte).**
> Bundle 84 landed schema + RLS + Pro-gated host UI + attendee render.
> Bundle 85 added free-tier one-time a-la-carte checkout unlock
> (`$3/event`) with Stripe Checkout + webhook fulfillment, plus
> `event_sponsors` payment metadata (`access_kind`, `paid_at`,
> `stripe_payment_intent_id`, etc.). Sponsor authoring now works for
> Pro hosts and for free hosts who unlock the slot for that event.

**File:**
[supabase/migrations/20260617000000_event_sponsors.sql](../../supabase/migrations/20260617000000_event_sponsors.sql),
[apps/web/src/app/events/[id]/edit/sponsor-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/edit/sponsor-panel.tsx),
[apps/web/src/app/events/[id]/\_components/event-sponsor-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-sponsor-section.tsx).

**Category:** revenue / community alignment.

This is the user's specific question — _should we add sponsor spots
on event pages?_ — and the audit's strongest opinion. Two shapes,
one good and one bad:

**Don't do:** PickupVB-sold third-party ad slots on event pages,
metro pages, or the home page. Reasoning:

- The event detail page is the **attendee's primary destination**.
  Selling its real-estate to brands the attendee didn't come to see
  is the textbook "money-hungry" move. Pre-launch, with no audience
  scale, the CPM math doesn't even cover the trust cost.
- Once we sell one ad, every product decision is partly defended on
  ad-revenue impact ("we can't simplify that block; it's the
  sponsor zone"). The pre-launch moment is the wrong moment to
  accept that constraint.

**Do:** **Host-owned sponsor slot.** Each event has an optional
host-defined sponsor block: a logo, a one-line message, optionally
a discount code. The host is the one with the relationship to the
sponsor — local sporting-goods store, brewery, physiotherapist —
and **PickupVB monetizes by charging the host**, not by selling
the slot ourselves. Two possible monetization shapes:

- **Pro-only feature** — Pro hosts get the sponsor slot at no
  per-event cost. Aligns with the "Pro = host operating system"
  positioning from P1 #1.
- **À-la-carte** — Free hosts can attach one sponsor per event for
  a flat fee ($2–$5/event) via the existing Stripe Connect plumbing.
  Pro hosts unlimited.

Either way, **PickupVB is never the one selling the inventory.**
The brand experience is "this host's local volleyball event,
sponsored by their local thing," which reads as community
infrastructure rather than ads.

**UX guardrails the implementation must honor:**

- Below the fold on event detail (after time / venue / register).
- Clearly labelled **Sponsor** (not disguised as content).
- Limit to one sponsor per event, one image, one line of copy. No
  animation, no auto-cycling, no third-party JS.
- Disclose the host's relationship: "Sponsored by [Brand] —
  arranged by the host." Sets the expectation that PickupVB isn't
  the ad seller.
- Sponsor's link gets `rel="sponsored noopener nofollow"` per
  current SEO posture.

**Recommended fix:** core + a-la-carte unlock are now in place. Next
follow-up (optional) is tuning the unlock price and deciding whether to
promote this to a dedicated host monetization dashboard/reporting view.

Host-side UI lives under
[apps/web/src/app/events/[id]/edit/](../../apps/web/src/app/events/%5Bid%5D/edit/),
attendee-side render at the bottom of
[apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx).
Charging path reuses Stripe Checkout + webhook patterns already used by
ticket/tip flows. **Estimate:** P2 #4 sponsor slot is complete for v1.

### 5. Trial-to-paid conversion isn't tracked

> **Status (2026-05-27, Bundle 98): SHIPPED.** Added
> `pro_trial_started` (fired on `customer.subscription.created`
> when `status === 'trialing'`) and `pro_trial_converted` (fired
> on `customer.subscription.updated` when previous status was
> `trialing` and new status is `active`) to the typed analytics
> port in
> [packages/domain/src/shared/analytics-port.ts](../../packages/domain/src/shared/analytics-port.ts).
> Emission lives in `handleSubscriptionChange` in
> [apps/web/src/app/api/webhooks/stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts).
> Target metrics are in
> [ADR 0014](../adr/0014-monetization-strategy.md#success-criteria-the-numbers-well-measure).
> PostHog dashboard funnel build is a manual config step on the
> launch checklist.

**File:**
[apps/web/src/app/auth/callback/route.ts](../../apps/web/src/app/auth/callback/route.ts)
(analytics identify),
[apps/web/src/app/api/webhooks/stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts)
(Stripe events).

**Category:** measurement.

Bundle 76 captures `host_payout_setup_completed`, `checkout_completed`,
`signup_completed`, but **not** `trial_started` or `trial_converted`
for the Pro subscription. We can't tell from PostHog today what % of
trial starts convert to paid, or how long the median trial-to-convert
gap is.

**Recommended fix:** extend
[packages/application/src/analytics/](../../packages/application/src/analytics/)
with `pro_trial_started` (fired on `customer.subscription.created`
where `status === 'trialing'`) and `pro_trial_converted` (fired on
the trialing → active transition). Then build the funnel in PostHog.
**Estimate: half a bundle.**

Without this, every Pro decision is unmeasured.

### 6. No metro-level sponsorship inventory plan

**File:** [apps/web/src/app/about/numbers/page.tsx](../../apps/web/src/app/about/numbers/page.tsx),
[supabase/migrations/20260615000000_public_numbers_views.sql](../../supabase/migrations/20260615000000_public_numbers_views.sql).

**Category:** revenue.

The `/about/numbers` page + `metro_health_weekly` view exist
explicitly to support sponsorship conversations
([analytics audit Bundle 78](analytics.md#l267)). But there's no
inventory model — no schema for "Acme Sports sponsors Atlanta
volleyball for Q3 2026," no rendering on the `/events?metro=…`
page, no rate card.

This is the **right shape of platform-sold sponsorship**: one
geographic sponsor per metro, displayed on the metro landing /
events listing only, with the metro relevance making the placement
feel like local infrastructure rather than rented attention.

**Recommended fix (deferred until ≥1 metro has steady weekly events):**
`metro_sponsors` table (metro_slug, brand_name, logo_url, link_url,
period_start, period_end, contracted_amount_cents). Single-sponsor
slot on the metro events list, marked **Metro sponsor**. Direct-
sold, not programmatic. Hold until we have at least one metro doing
≥2 events/week.

**Estimate: 1 bundle** when triggered.

### 7. Off-platform events get full platform value at zero revenue

> **Status (2026-05-27, Bundle 100): SHIPPED.** Added a soft,
> dismissible nudge on the event detail page rendered only for the
> event's host when `event.paymentsOffPlatform === true` and the
> `pickupvb_op_upsell_dismissed` cookie isn't set. "Switch" links
> to `/events/[id]/edit`; "Dismiss" calls a server action that
> writes the cookie for ~1 year. Per-browser cookie scoping matches
> the audit's "single-occurrence" framing — once a host has seen
> the pitch, repeating it on every event is nag-y. Files:
> [apps/web/src/app/events/[id]/\_components/off-platform-upsell.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/off-platform-upsell.tsx),
> [apps/web/src/app/events/[id]/off-platform-upsell-actions.ts](../../apps/web/src/app/events/%5Bid%5D/off-platform-upsell-actions.ts),
> [apps/web/src/lib/off-platform-upsell.ts](../../apps/web/src/lib/off-platform-upsell.ts).

**File:** [docs/payments.md#L113-L126](../payments.md#L113-L126).

**Category:** revenue.

A host who flips `payments_off_platform = true` uses every PickupVB
feature (event page, RSVP management, broadcasts, reminders,
roster) and pays $0. This is a **deliberate product mode** (per the
ADR), and rightly so — it's how a casual Venmo-driven host onboards.
But it caps lifetime revenue on those hosts at zero.

**Don't:** charge for off-platform events (kills the casual host
on-ramp).

**Do:** add a soft, dismissible upsell on the event detail page for
off-platform events: "Tired of chasing Venmos? Switch to on-platform
payments — automatic refunds, no chasing." Single-occurrence cookie
to suppress per host. **Estimate: half a bundle.** Already partially
informed by the existing PaymentMode product surface.

This is also a candidate for a "Pro: includes on-platform setup
help" handhold but that's service work, not product.

---

## P3 — opportunistic / post-PMF

### 8. Annual plan undersold

**File:** [apps/web/src/app/pricing/page.tsx#L106-L113](../../apps/web/src/app/pricing/page.tsx#L106-L113).

Annual at $100 saves $20/yr vs monthly — a **17% discount**. Industry
SaaS norm is 17–20%, so the math is fine, but the page treats the two
options as equal-weight buttons. Annual gets churn protection, monthly
gets cash sooner; **for a brand-new product, annual is usually worth
more** (lower churn, locked LTV). Worth A/B-ing the default button
selection once we have an A/B framework (analytics P3 #11).

### 9. Tip jar take-rate parity with tickets is probably wrong

**File:** [apps/web/src/app/events/[id]/tip-actions.ts](../../apps/web/src/app/events/%5Bid%5D/tip-actions.ts).

We take the same 5% / 2.5% on tips as on tickets. Tips are
discretionary attendee-to-host transfers; taking a platform fee on
them is harder to defend than on transactions PickupVB enabled.
Consider zero-fee or capped-fee tips ($0.30 + 0% past, say).
Revenue-neutral if tip volume is small; goodwill positive.

### 10. No referral / friend-of-friend host incentive

A host who brings another host should get a credit (e.g. 1 free
month of Pro per referred host that publishes 3+ paid events).
Standard PLG move; defer until trial-conversion baseline is known
(P2 #5).

### 11. SMS as a Pro perk when Twilio lands

**File:** [packages/notifications/src/templates.ts#L224-L230](../../packages/notifications/src/templates.ts#L224-L230)
(stub).

When SMS is wired, it should be Pro-only (or low-quota for Free).
SMS has real per-message cost (~$0.008 US, much more international)
and is the clearest "Pro pays for what it costs us" lever. Decide
the gating model alongside the SMS implementation bundle so the
free tier doesn't get the feature first and then have it taken
away.

---

## What I'd ship in what order

Concrete sequencing, smallest valuable first:

1. **Bundle: pass Stripe processing fee to buyer (P1 #2).** Half a
   day, no UX downside, biggest host-trust win.
2. **Bundle: host-owned sponsor slot v1 (P2 #4, Pro + a-la-carte).**
   Bundle 84 shipped schema/UI/render; Bundle 85 shipped free-tier
   one-time checkout unlock and webhook fulfillment. Closed.
3. **Bundle: saved event templates (P1 #1 sub-item).** One bundle.
   Shipped in Bundle 86 (Pro-gated save/apply in `/events/new`).
4. **Bundle: host analytics dashboard (P1 #1 sub-item).** One to
   two bundles. Shipped in Bundle 87 (`/profile/billing/analytics`,
   Pro-gated) with fill-rate, repeat-attendee, and GMV trend metrics.
5. **Bundle: custom refund policy gating (P1 #1 sub-item).** Half a
   bundle. Shipped in Bundle 98 — `parseRefundWindowHours` accepts
   `{ allowCustom }`; Free hosts clamp to 24h, Pro hosts get 0–720.
6. **Bundle: trial-to-paid funnel capture (P2 #5).** Half a bundle.
   Shipped in Bundle 98 — `pro_trial_started` / `pro_trial_converted`
   fire from the Stripe webhook.
7. **ADR + journal entry: monetization strategy (P1 #3).** Half a
   bundle. Shipped in Bundle 98 as
   [ADR 0014](../adr/0014-monetization-strategy.md).

Bundles 1–6 together earn Pro its $10 sticker price for both ends of
the host distribution (low-volume hosts get features; high-volume
hosts get fee discount + sponsor slot).

---

## Open questions for the user (require input I can't infer)

> **Answered 2026-05-24.** Responses inlined below; downstream
> findings updated accordingly.

1. **What's the actual Vercel / Supabase / Sentry / Resend monthly
   spend today?**
   _Answer:_ list-price estimates ($70–$110/mo) are fine for now.
   Revisit once real invoices accumulate post-launch.
2. **What's the target audience size for v1 launch?**
   _Answer:_ **two–three metros — Pittsburgh, Erie, Cleveland.**
   Sizing implication: medium scale. Pro doesn't need to break
   even at launch but should be pointed at the right host
   archetype (serial host running weekly paid sessions across
   one of the three metros). Use this as the target persona for
   the Pro fattening tracks (templates, host analytics).
3. **Is there an existing sponsor relationship for a launch metro?**
   _Answer:_ **no.** Decision: **ship host-owned sponsor slot
   (P2 #4) first**; metro-level sponsor inventory (P2 #6) stays
   deferred until a metro has a real anchor advertiser to design
   around. P2 #4 is now the next bundle in flight after P1 #2.
4. **Are we willing to gate co-hosts behind Pro (P1 #1 item 5)?**
   _Answer:_ **no.** P1 #1 item 5 is removed from the Pro
   fattening plan. Pro grows via net-new features only — no
   clawback from existing free users.

---

## Remediation log

- **2026-06-08 — O-2 shipped: Club tier + group payouts ([ADR 0038](../adr/0038-group-payouts-club-tier.md), uncommitted; migration deploy-gated).**
  The highest-risk bundle (touches money routing — payments.md "read before
  touching"). v1 = pooled payouts only. A group subscribes to **Club** (~$25/mo,
  Stripe Billing on the platform; `group_subscriptions` + `is_club_group`),
  connects its **own** Connect account (`group_stripe_accounts`; onboarding mirrors
  the host flow, `owner_type='group'` metadata branches the `account.updated`
  webhook), and opts group-hosted events to it via `events.payout_group_id`. The
  per-event flows (ticket/team/tip/roster-team) now resolve through
  `getEventPayoutAccount(eventId, hostId)` — **never falls back to host** if the
  club account isn't charges-enabled; routing frozen once a registration is paid;
  existing + non-opted events route to `host_id` unchanged; platform fee still
  keys on the host user. New: migration `20261002000000_group_payouts_club.sql`,
  `lib/{group-stripe-account,club,event-payout}.ts`, `groups/[id]/billing/`
  (page + actions), `events/[id]/edit/payout-actions.ts` + edit panel, webhook
  branches (`account.updated` group + subscription `kind=club`), 4 checkout-site
  swaps, hand-edited DB types. Docs: payments.md (TL;DR + routing + resolved the
  open limitation), AGENTS Pattern 7 amended, features.md, pricing FAQ.
  Quad-green. Deferred: multi-admin Pro, club analytics, club income in the
  per-user earnings page. O-3/O-4/O-5/O-8/O-9 remain open.

- **2026-06-08 — O-7 shipped: recurring memberships (Phase 2 of O-1; [ADR 0037 Phase 2](../adr/0037-season-passes.md), uncommitted; migration deploy-gated).**
  A Pro host sells a monthly membership (`host_membership_plans`); a buyer
  subscribes via a **Connect destination subscription** (`mode: 'subscription'`,
  `transfer_data` + tiered `application_fee_percent` — the first recurring
  host-routed flow); while active (`is_active_member`, M-2 past_due backstop) they
  **claim free spots** on the host's `accepts_pass_credits` open plays via
  `claim_membership_spot` (no charge, unlimited). Subscription state mirrors from
  the `customer.subscription.*` webhook (branched on `metadata.kind =
'host_membership'`); cancel = `cancel_at_period_end` via Stripe API. New:
  migration `20261001000000_host_memberships.sql`, `lib/memberships.ts` +
  `lib/membership-helpers.ts` (+ test), host plan CRUD
  (`profile/billing/memberships/actions.ts`), buyer subscribe/claim/cancel
  (`events/[id]/membership-actions.ts`), the webhook branch, host management page,
  buyer `/profile/passes` (now "Passes & memberships" with cancel), extended
  `PassPanel` (member-claim precedence), pricing/features/payments copy,
  hand-edited DB types, `host_membership.changed` audit action. Quad-green.
  Deferred: annual interval, credit-refill variant, earnings/CSV, buyer-paid fee.
  Also catalogued **O-8** (white-label branding) / **O-9** (waiver e-sign) as
  not-started.

- **2026-06-08 — O-1 shipped: season passes ([ADR 0037](../adr/0037-season-passes.md), uncommitted; migration deploy-gated).**
  Built the strongest opportunity to a v1 vertical. A Pro host sells a prepaid
  credit pack (`host_passes`); a buyer purchases it as a **destination charge to
  the host** (`pass_purchases`, tiered platform fee — host-routed, unlike the
  platform-direct sponsor/badge unlocks); the host opts open-play events into
  `events.accepts_pass_credits`; the buyer redeems a credit to reserve a spot via
  the atomic `redeem_pass_credit` SECURITY DEFINER RPC (capacity trigger fires,
  zero charge); cancelling returns the credit (participant-delete cascade → the
  `event_participant_payments` AFTER DELETE trigger decrements `credits_used`).
  New: migration `20260930000000_season_passes.sql`, `lib/passes.ts` +
  `lib/pass-helpers.ts` (+ `pass-helpers.test.ts`), host actions
  (`profile/billing/passes/actions.ts`), buyer actions
  (`events/[id]/pass-actions.ts`), `pass_purchase` webhook fulfillment in
  `webhooks/checkout.ts`, host management page, buyer `/profile/passes`,
  event-detail `PassPanel`, event-edit opt-in, pricing copy, hand-edited DB
  types. Hand-edited types flagged for regen on next `gen:types`.
  `pnpm typecheck && lint && test && build` green. Deferred: earnings/CSV
  ledger integration, buyer-paid fee line, post-purchase banner (PassPanel is
  the feedback). O-2…O-6 remain open.

- **2026-06-08 — Re-audit + all five code/gap findings fixed (uncommitted; M-2
  migration deploy-gated).** Re-ran the monetization lens with a code-correctness
  layer (status block at top). Shipped:
  - **M-2 (P2, bug)** — `is_pro_host` past_due grace had no period-end backstop →
    indefinite free Pro if Stripe dunning is misconfigured. New migration
    [20260929000000_is_pro_host_period_end_backstop.sql](../../supabase/migrations/20260929000000_is_pro_host_period_end_backstop.sql)
    self-expires a past_due row ~30d past `current_period_end`; required Stripe
    "cancel after retries" dunning setting documented in
    [integrations.md § Stripe](../integrations.md#stripe). Signature unchanged,
    no type regen.
  - **M-3 (P3, stale)** — centralized `SPONSOR_SLOT_UNLOCK_CENTS` ($3) +
    `BADGE_SLOT_UNLOCK_CENTS` ($5) in [pro.ts](../../apps/web/src/lib/pro.ts);
    [sponsor-actions.ts](../../apps/web/src/app/events/%5Bid%5D/edit/sponsor-actions.ts) /
    [badge-actions.ts](../../apps/web/src/app/events/%5Bid%5D/edit/badge-actions.ts)
    import them; pricing + Pro page copy now derive the dollar figure (6 hand-typed
    literals removed).
  - **M-3b (P3, gap)** — documented the deliberate no-ledger-row decision for the
    sponsor/badge unlocks in [checkout.ts](../../apps/web/src/lib/webhooks/checkout.ts)
    (they're platform revenue, excluded from host earnings; category reserved for
    forward-compat only).
  - **M-4 (P2, gap)** — [ADR 0014](../adr/0014-monetization-strategy.md) amendment
    records badges as a Pro perk + the centralized à-la-carte prices; the stale
    "Today's monetization surface" section is flagged historical, pointing to the
    2026-06-08 status block.
  - **M-5 (P2, gap)** — [payments.md](../payments.md#platform-direct-charges-not-host-routed)
    gained a "Platform-direct charges (NOT host-routed)" section covering the two
    slot unlocks + the Pro subscription (no Connect destination, no host onboarding).
  - **Opportunities O-1…O-6 left open** for a later strategy pass (O-1 season
    passes is the strongest). `pnpm typecheck && lint && test && build` green.

- **2026-06-01 — R-2 resolved (Path A, cost-control — no paywall).** Premise
  corrected first: ADR 0024 "media" is external links (≈$0 storage); avatar/hero/
  logo are one upload each; the only real byte-volume surface is **chat
  attachments**, a community surface a Pro gate must not touch. User chose Path A.
  Shipped a universal per-user chat-attachment upload cap (≤ 40 attachment
  messages / 24h) in `sendChatMessage` over the existing fail-open
  `consumeRateLimit`; text chat unthrottled; `rateLimitKey` gained a hashed
  `'user'` dimension. No Pro gate, no migration. Path B (Pro event photo gallery)
  held pending host demand. Verify quad green.

- **2026-06-01 — R-3 shipped — standalone-bracket free cap.** Free hosts run 1
  active (non-completed) standalone bracket at a time; Pro unlimited. Completed
  brackets don't count (history preserved). `validateActiveBracketCap`
  ([standalone-bracket-cap.ts](../../apps/web/src/lib/standalone-bracket-cap.ts),
  unit-tested) mirrors the paid-event cap; enforced in
  `createStandaloneBracketFromForm` + a proactive upgrade card on `/brackets/new`.
  Net-new gate on a net-new surface — the in-event bracket generator stays free
  and uncapped. [ADR 0025 addendum](../adr/0025-standalone-brackets.md) + pricing/
  features copy. Verify quad green.

- **2026-06-01 — R-5 shipped — tip fee dropped to 0%.** PickupVB now takes no
  platform fee on tips, any tier (`tipPlatformFeeCents()` → 0, unit-tested);
  `checkout-session.ts` omits `application_fee_amount` when 0 so the host
  receives 100% of the tip, less only Stripe's processing fee. Ticket fees
  unchanged. Copy updated across pricing / Pro / tip-jar; recorded as an
  [ADR 0014 amendment](../adr/0014-monetization-strategy.md). Also corrected the
  2026-05-31 re-eval's R-1 finding: **live scoring is already built** (ADR 0023
  phases 1–5, 2026-05-30) — the "unbuilt" framing relied on a stale ADR status +
  memory note, both fixed; only the Phase-6 realtime e2e remains. Verify quad
  green.

- **2026-05-31 — Re-evaluation (no code landed).** Re-ran the monetization
  lens after a week of feature shipping (chat / media / avatars / live scores /
  broadcast notifications / MapTiler). Findings + revised cost floor in the
  **[Status — 2026-05-31](#status--2026-05-31--re-evaluation-post-chat--media--live-scoring--maptiler)**
  block at the top. Net: the new features are cost centers; the revenue engine
  is sound; the lever is Pro **conversion**, not price. New P1 = ship the
  already-designed live-scoring Pro perk (R-1, [ADR 0023](../adr/0023-live-match-scoring.md)).
  Four open questions await the user before any bundle lands.

- **2026-05-27 — Bundle 100** — **P2 #7 — off-platform event
  upsell.** Soft, dismissible nudge rendered above the hero on
  `/events/[id]` only when the viewer is the event's host and
  `event.paymentsOffPlatform === true`. New server action
  `dismissOffPlatformUpsell` sets the
  `pickupvb_op_upsell_dismissed` cookie (path-global, ~1y,
  `sameSite=lax`) and `revalidatePath`s the event detail. New
  files:
  [apps/web/src/lib/off-platform-upsell.ts](../../apps/web/src/lib/off-platform-upsell.ts)
  (cookie-name constant — shared by page reader + action),
  [apps/web/src/app/events/[id]/off-platform-upsell-actions.ts](../../apps/web/src/app/events/%5Bid%5D/off-platform-upsell-actions.ts),
  [apps/web/src/app/events/[id]/\_components/off-platform-upsell.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/off-platform-upsell.tsx).
  Wired in
  [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx)
  between `EventFlashBanners` and `HeroImage`. Closes the last
  P2 item that wasn't either shipped or deferred-on-trigger.
  Verify gate (typecheck + lint + test + build) green. Journal:
  [docs/journal/2026-05-digest.md#bundle-100](../journal/2026-05-digest.md#bundle-100).

- **2026-05-27 — Bundle 99** — **P1 #1 sub-item #4 — invite-only /
  private events.** Closes P1 #1 overall. Four changes in one
  half-bundle: (1) new RLS migration
  `20260702000000_invite_only_events_readable_by_link.sql` makes
  `visibility = 'invite_only'` rows readable by anyone holding the
  canonical URL (anon or signed-in), while keeping them out of
  `/events`, sitemap, and `public_numbers_views` (all already
  filter `visibility = 'public'`); (2) follow-up discovery-leak
  patch — new migration
  `20260702000100_search_events_filter_visibility_public.sql`
  adds `visibility = 'public'` to the `search_events` RPC where
  clause, and `searchFollowingFeed` in
  `packages/infrastructure/src/supabase-event-repository.ts` adds
  `.eq('visibility', 'public')` to its events query, since both
  are `security invoker` / direct-table surfaces that would
  otherwise leak `invite_only` rows under the new RLS; (3) new
  `apps/web/src/lib/visibility.ts` helper `clampVisibilityForHost`
  is the server-side security boundary — wired into both
  `/events/new` and `/events/[id]/edit` actions, with the edit
  path checking `detail.hostUserId` so a Pro co-host can't promote
  a Free host's event; (4) both forms disable the visibility
  `<select>` for Free hosts with a Pro nudge, mirroring the
  Bundle 98 `RefundWindowField` pattern. The pricing page already
  advertised this perk; copy now matches behavior. Verify gate
  (typecheck + lint + test + build) green; 6 new unit tests.
  Journal:
  [docs/journal/2026-05-digest.md#bundle-99](../journal/2026-05-digest.md#bundle-99).

- **2026-05-27 — Bundle 98** — Three P1/P2 closeouts in one bundle:
  (1) **P1 #1 sub-item #3 — custom refund policy gating.**
  `parseRefundWindowHours` now accepts `{ allowCustom }`; Free hosts
  clamp to the 24h default, Pro hosts get 0–720h. Server-side
  enforcement in both `/events/new` and `/events/[id]/edit` actions;
  UI gating via a shared `RefundWindowField` helper in both forms
  (Pro nudge for Free hosts).
  (2) **P2 #5 — trial-to-paid funnel.** Two new typed analytics
  events (`pro_trial_started`, `pro_trial_converted`) flowing from
  `handleSubscriptionChange` in the Stripe webhook. Dispatch now
  forwards `previous_attributes` so the trialing→active transition
  is detectable.
  (3) **P1 #3 — monetization ADR.** New ADR
  [0014-monetization-strategy.md](../adr/0014-monetization-strategy.md)
  records the $10/mo, 50% fee discount, 1-paid-event-per-30d,
  14-day-trial decisions with success criteria and rejected
  alternatives. Journal:
  [docs/journal/2026-05-digest.md#bundle-98](../journal/2026-05-digest.md#bundle-98).
  Verify gate (typecheck + lint + test + build) green. The only
  remaining P1 #1 sub-item is invite-only / private events.

- **2026-05-24 — Bundle 88** — Opas audit of Bundles 84–87 completed.
  Five fixes shipped: (1) sponsor form inputs no longer disabled for
  non-Pro users — the $3 à-la-carte checkout flow now works end-to-end;
  (2) fill-rate numerator scoped to capacity-set events only, preventing
  rates > 100%; (3) analytics page early-returns for non-Pro users,
  skipping all DB queries; (4) merged duplicate import in sponsor-actions.ts;
  (5) removed spurious `as never` upsert casts in both action files.
  Validation gate cleared. See [docs/journal/2026-05-digest.md#bundle-88](../journal/2026-05-digest.md#bundle-88).

- **2026-05-24 — Validation gate requested** — Pause feature expansion and
  run an **Opas audit** for Bundles 84–87 after the 8pm EST rate-limit
  reset. Scope: verify implementation correctness and regression risk for
  Bundle 84 (sponsor slot core), Bundle 85 (a-la-carte sponsor unlock),
  Bundle 86 (saved templates), and Bundle 87 (host analytics dashboard).
  Treat this as a required sign-off checkpoint before resuming higher-impact
  monetization features.

- **2026-05-24** — Audit authored. No remediation yet — next bundle
  will pick up P1 #2 (Stripe fee pass-through) or P2 #4 (host-owned
  sponsor slot) depending on user direction.
- **2026-05-24** — Open questions answered. Launch scope: 2–3 metros
  (Pittsburgh, Erie, Cleveland). No existing sponsor relationships
  → host-owned slot (P2 #4) confirmed as next bundle. Co-host
  gating (P1 #1 item 5) dropped. Vendor-cost numbers deferred.
- **2026-05-24 — Bundle 83** — P1 #2 shipped. New `events.pass_processing_fee_to_buyer`
  column (default true for new events, backfilled false for existing
  rows). Three checkout-action paths emit a "Processing fee" line
  item when set; create + edit forms expose the toggle. Hosts now
  receive the full advertised ticket + service-fee subtotal on
  payout instead of silently absorbing Stripe's ~2.9% + 30¢. See
  [docs/journal/2026-05-digest.md#bundle-83](../journal/2026-05-digest.md#bundle-83).
- **2026-05-24 — Bundle 84** — P2 #4 v1 core shipped.
  `event_sponsors` table + RLS, Pro-gated host sponsor authoring on
  event edit, attendee-side sponsor block render on event detail.
  See [docs/journal/2026-05-digest.md#bundle-84](../journal/2026-05-digest.md#bundle-84).
- **2026-05-24 — Bundle 85** — P2 #4 follow-up shipped.
  Added free-tier one-time a-la-carte sponsor unlock checkout,
  Stripe webhook fulfillment for sponsor payments, and sponsor payment
  metadata columns (`access_kind`, `paid_at`, checkout/payment ids).
  P2 #4 is now closed for v1.
- **2026-05-24 — Bundle 86** — P1 #1 sub-item #1 shipped.
  Added host-saved event templates with Pro gating: new
  `host_event_templates` table + RLS, `saveEventTemplateFromForm`
  server action, and `/events/new` apply/save UI with template prefill.
  This closes one of the three primary Pro-feature expansion tracks;
  host analytics and custom refund-policy gating remain open.
- **2026-05-24 — Bundle 87** — P1 #1 sub-item #2 shipped.
  Added Pro-gated host analytics dashboard at
  `/profile/billing/analytics`, wired from billing quick actions.
  v1 includes hosted-event counts, repeat-attendee rate, fill-rate
  (capacity-backed where configured), GMV/revenue trend, and a recent
  events snapshot. Custom refund-policy gating remains the next P1 #1
  monetization track.
