# 2026-06-08 — Monetization re-audit + code/gap fixes (M-2…M-5)

## Context

User asked to re-run the monetization audit (bugs, gaps, improvements, stale
code, and new value-aligned opportunities), then to **implement the
bugs/gaps/stale code and leave the opportunities for later**. The existing
[monetization.md](../audits/monetization.md) was a strategy audit last touched
2026-05-31 and predated the collectible-badges monetization surface
([ADR 0031](../adr/0031-gamification-badges.md)). The re-audit added a 2026-06-08
status block (0 P1; 3 P2 + 2 P3 code/gap findings; 6 opportunities O-1…O-6) and
all five non-opportunity findings were fixed the same session. Quad-green,
uncommitted (the one migration is deploy-gated).

## Decisions

- **M-2 — `is_pro_host` past_due grace needed a code-level backstop, not just
  trust in Stripe config.** The function granted Pro for
  `status in ('trialing','active','past_due')` and read nothing else. The
  past_due grace is intentional (Stripe retries ~3 weeks), but its _end_ was
  entirely outsourced to the Dashboard "Manage failed payments" setting — if that
  is left on "do nothing", a permanently-failing card stays past_due forever and
  keeps Pro for free; a missed terminal subscription webhook has the same effect.
  Added [20260929000000_is_pro_host_period_end_backstop.sql](../../supabase/migrations/20260929000000_is_pro_host_period_end_backstop.sql):
  the past_due branch now also requires `current_period_end > now() - interval
'30 days'`, so an abandoned row self-expires ~30d past the paid period
  regardless of dunning/webhooks. A null `current_period_end` on past_due falls
  through to NOT Pro (defensive). trialing/active unchanged; signature unchanged
  → no type regen. The required Stripe "cancel after retries" setting is now
  documented in [integrations.md § Stripe](../integrations.md#stripe) — the
  Dashboard is still the primary control, the SQL is defense-in-depth.

- **M-3 — centralize the à-la-carte unlock prices, the same discipline already
  applied to the fee rate.** `$3` (sponsor) and `$5` (badge) lived as private
  consts in two action files **and** as six hand-typed string literals across the
  pricing + Pro pages. Moved `SPONSOR_SLOT_UNLOCK_CENTS` / `BADGE_SLOT_UNLOCK_CENTS`
  into [pro.ts](../../apps/web/src/lib/pro.ts) next to `PRO_MONTHLY_PRICE_USD`;
  the action files import them and the marketing copy derives the dollar figure
  (`$${CENTS / 100}`). One number to change now, and ADR 0014's "rate changes need
  an amendment" rule explicitly covers them.

- **M-3b — the missing ledger row is a _deliberate_ deferral, not a bug.** The
  receipts-tax bundle ([20260926000000_payment_audit_category.sql](../../supabase/migrations/20260926000000_payment_audit_category.sql))
  already reserved `sponsor_slot`/`badge_slot` in the `category` enum + CHECK and
  _intentionally_ excludes them from host earnings (the host is the buyer here,
  not the payee — this is platform revenue). So the fix was **not** to write
  half-baked ledger rows (which would risk leaking into receipt surfaces) but to
  document the decision in [checkout.ts](../../apps/web/src/lib/webhooks/checkout.ts)
  so the next reader doesn't "fix" it. The buyer's receipt is Stripe's emailed
  receipt from the platform account.

- **M-4 / M-5 — the two highest-value findings were documentation drift, not
  code.** ADR 0014 listed "nine perks" and never mentioned badges; the audit's
  "Today's monetization surface" section read as current but predated badges +
  the tips→0% change. payments.md's routing table documents the three Connect
  destination charges but never the two **platform-direct** charges (sponsor/badge
  unlocks) or the Pro subscription — a reader could wrongly "fix" them by adding
  `transfer_data.destination`, which would hand PickupVB's add-on revenue to the
  host. Added an ADR 0014 amendment (badges + centralized prices), flagged the
  stale audit section historical (pointing to the new status block), and added a
  "Platform-direct charges (NOT host-routed)" section to
  [payments.md](../payments.md#platform-direct-charges-not-host-routed).

## Deferred

- **Opportunities O-1…O-6** (monetization.md 2026-06-08 status block) — left for a
  later strategy pass per the user's instruction. **O-1 (season passes /
  multi-session punch cards)** is the strongest: a host-priced bundle that wins
  for attendee (discount + one payment), host (committed up-front cash, less
  weekly Venmo chasing), and platform (normal take-rate on a larger transaction),
  and pulls off-platform hosts onto Stripe. Needs an ADR before code. O-2
  (club/group tier with pooled payouts) resolves the standing payments.md
  open-question. O-6 (platform "featured event" boost) is flagged **lean-NO** —
  conflicts with the ADR-0014 no-platform-discovery-ads principle.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green. Pre-existing
lint warnings (setState-in-effect) and test env-var log noise are unrelated to
this bundle. The migration is **not** applied locally (deploy-gated, per repo
convention).
