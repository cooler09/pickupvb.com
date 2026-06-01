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
- **The single highest-ROI move is already designed and unbuilt:** ship live
  match scoring ([ADR 0023](../adr/0023-live-match-scoring.md), Proposed) as
  the next Pro perk. It earns $10 for the tournament / league serial host —
  the exact archetype Pro targets — and draws the monetization line where ADR
  0014 says it belongs (manual scoring free for everyone; the live,
  match-bound, auto-saving scoreboard is Pro).

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

#### R-1 (P1) — Ship the designed live-scoring Pro perk

**File:** [ADR 0023](../adr/0023-live-match-scoring.md) (Proposed, unbuilt);
gate at `isPro(event.hostId)` ([pro.ts](../../apps/web/src/lib/pro.ts)).

The strongest unrealized conversion lever. Live, match-bound, auto-saving
scoreboard for Pro hosts; manual score entry stays free for everyone (no
clawback). Targets the tournament / league host — the high-GMV serial host Pro
was built for — with a feature reason to upgrade independent of the fee
discount. Already specced end-to-end in the ADR. **Estimate:** per the ADR's
phased plan (6 steps, mostly low / medium).

#### R-2 (P2) — Tier the new media / storage surfaces by _volume_, not by community gate

**File:** [ADR 0024](../adr/0024-event-and-profile-media.md) (media);
chat attachments ([ADR 0028](../adr/0028-chat-messaging.md)).

Media galleries, chat image attachments, and avatars all consume egress — the
cost surface that grew most this week. Community-safe recovery: a **generous
free quota** (e.g. N photos / event at standard resolution) with Pro getting
higher limits / longer retention / video. **Gate volume, never viewing or basic
posting.** Recovers storage / egress from the heaviest users without paywalling
a core community surface. **Estimate: 1 bundle** once the free-tier numbers are
chosen.

#### R-3 (P2) — Standalone brackets as a Pro / à-la-carte surface

**File:** [ADR 0025](../adr/0025-standalone-brackets.md).

The in-event bracket generator stays free (no clawback per ADR 0014). But
**standalone** brackets are a net-new surface — a free cap (e.g. 1 active
standalone bracket) with Pro unlimited is a clean, no-takeaway lever that
monetizes the tournament-organizer power user. **Estimate: half a bundle.**

#### R-4 (P3 → promote on Twilio) — Reaffirm SMS-as-Pro when Twilio lands

Carries over [P3 #11](#11-sms-as-a-pro-perk-when-twilio-lands). SMS is the
clearest "Pro pays for what it costs us" lever (real per-message cost ~$0.008
US). Decide gating **in** the SMS bundle (Pro-only or low free quota) so it
isn't shipped free-first then clawed back.

#### R-5 (P3) — Tip-jar fee posture as a trust signal

Carries over [P3 #9](#9-tip-jar-take-rate-parity-with-tickets-is-probably-wrong).
Re-decide deliberately: a "we don't take a cut of tips" stance is a strong
community-trust signal at near-zero revenue cost pre-launch (tip volume is
small). Either drop or cap the tip fee — and market it. Goodwill / brand lever
more than a revenue one.

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

| Vendor                  | Plan assumption  | Monthly       | Notes                                                                                      |
| ----------------------- | ---------------- | ------------- | ------------------------------------------------------------------------------------------ |
| Supabase Pro            | $25 base         | $25           | + usage when we exceed free Auth MAU + 8GB db                                              |
| Vercel Pro              | $20/seat         | $20           | + bandwidth/build minutes over free                                                        |
| PostHog                 | Free             | $0            | free up to 1M events/mo per [docs/integrations.md#L167-L198](../integrations.md#L167-L198) |
| Sentry Team             | $26              | $26           | required for source maps + replay                                                          |
| Resend                  | $20 / 50k emails | $0–$20        | $0 free tier; $20 needed once ~3k emails/mo                                                |
| Cloudflare Turnstile    | Free             | $0            |                                                                                            |
| Domain + misc           |                  | ~$1           |                                                                                            |
| **Floor (pre-Twilio)**  |                  | **~$70–$110** |                                                                                            |
| Twilio SMS (when wired) | $0.0083/SMS      | variable      | 1000 SMS = $8.30                                                                           |

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
> See [docs/journal/2026-05-24-bundle-83.md](../journal/2026-05-24-bundle-83.md).

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
> entry: [docs/journal/2026-05-27-bundle-98.md](../journal/2026-05-27-bundle-98.md).

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
  [docs/journal/2026-05-27-bundle-100.md](../journal/2026-05-27-bundle-100.md).

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
  [docs/journal/2026-05-27-bundle-99.md](../journal/2026-05-27-bundle-99.md).

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
  [docs/journal/2026-05-27-bundle-98.md](../journal/2026-05-27-bundle-98.md).
  Verify gate (typecheck + lint + test + build) green. The only
  remaining P1 #1 sub-item is invite-only / private events.

- **2026-05-24 — Bundle 88** — Opas audit of Bundles 84–87 completed.
  Five fixes shipped: (1) sponsor form inputs no longer disabled for
  non-Pro users — the $3 à-la-carte checkout flow now works end-to-end;
  (2) fill-rate numerator scoped to capacity-set events only, preventing
  rates > 100%; (3) analytics page early-returns for non-Pro users,
  skipping all DB queries; (4) merged duplicate import in sponsor-actions.ts;
  (5) removed spurious `as never` upsert casts in both action files.
  Validation gate cleared. See [docs/journal/2026-05-24-bundle-88.md](../journal/2026-05-24-bundle-88.md).

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
  [docs/journal/2026-05-24-bundle-83.md](../journal/2026-05-24-bundle-83.md).
- **2026-05-24 — Bundle 84** — P2 #4 v1 core shipped.
  `event_sponsors` table + RLS, Pro-gated host sponsor authoring on
  event edit, attendee-side sponsor block render on event detail.
  See [docs/journal/2026-05-24-bundle-84.md](../journal/2026-05-24-bundle-84.md).
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
