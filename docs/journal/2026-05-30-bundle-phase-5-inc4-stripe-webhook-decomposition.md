# Phase 5 inc. 4 — Stripe webhook decomposition (P3-2, partial) (2026-05-30)

## Context

Fourth Phase 5 increment. Chips at **P3-2** (Stripe webhook god-handler —
[architecture.md](../audits/architecture.md)): the most critical money path had
the least structure — an **833-LOC** `api/webhooks/stripe/route.ts` with the
signature/idempotency boundary, the dispatch switch, all 7 event handlers, and
the team-payment mediator helpers inline in one file.

## Decisions

- **Did the structural half (extract handlers → `lib/webhooks/`), deferred the
  behavioural half (route DB writes through the payment repos).** The audit's
  Fix has two parts: (1) "extract one handler per event into `lib/webhooks/`,
  route becomes a dispatch switch" and (2) "route the DB writes through the
  existing payment repositories." Part 2 changes the **write path** of live
  charge processing (the inline `admin.from(...).update/insert` calls become
  repo method calls) — a behavioural change on the money path that genuinely
  needs **characterization tests first** (this code has none, and Stripe + the
  admin Supabase client are heavy to mock). So this increment is **part 1
  only**: a verbatim relocation — same logic, same inline queries, same order of
  operations — verified structurally + by a parity audit, with **zero behaviour
  change**. Part 2 is the clearly-scoped follow-up. (Same safe-half-first shape
  as P3-1 / P2-3 / P2-6.)
- **Grouped by Stripe concern (the file's own section banners), not strictly
  one-file-per-event.** Five cohesive modules read better than nine tiny ones
  and keep shared types/helpers next to their only consumers:
  - `lib/webhooks/connect.ts` (81) — `handleAccountUpdated` + `handlePayoutPaid`
    (Connect account/payout).
  - `lib/webhooks/checkout.ts` (297) — `CheckoutMetadata`,
    `handleCheckoutCompleted` (+ the private `lookupHostId`),
    `handleCheckoutExpired`.
  - `lib/webhooks/charge.ts` (120) — `handleChargeRefunded` +
    `handlePaymentFailed`.
  - `lib/webhooks/subscription.ts` (108) — `handleSubscriptionChange`.
  - `lib/webhooks/team-payment-mediators.ts` (132) — the 6 aggregate-mediated
    mark/expire/refund helpers (team-registration + roster-team), shared by
    checkout + charge. The leaf module (imports nothing from the others).
- **`route.ts`: 833 → 156 LOC** — now the signature verify + idempotency
  upsert/dedupe + `processed_at` bookkeeping + the `dispatch` switch importing
  the handlers. The switch is byte-for-byte the same.
- **Parity-audited the move** (money path — no silent drops): all 8
  `analytics.capture` calls (1 connect + 5 checkout + 2 subscription), both
  `notify` calls (charge-refunded + payout), every captured event name +
  checkout `kind`, and the full `admin.from(...)` table-op distribution
  (`event_participant_payments` ×3, `event_participants` ×4, `event_payment_audit`
  ×2, `event_sponsors` ×1, `event_tips` ×4, `events` ×2, `host_stripe_accounts`
  ×2) match the original.
- **No tests this increment.** Part 1 is a pure relocation (typecheck + build +
  the parity audit verify it). Characterization tests belong with part 2, where
  they protect an actual write-path change.

## Changes

- **Web (new):** `lib/webhooks/{connect,checkout,charge,subscription,team-payment-mediators}.ts`.
- **Web:** [api/webhooks/stripe/route.ts](../../apps/web/src/app/api/webhooks/stripe/route.ts)
  — 833 → 156 LOC (boundary + dispatch switch).
- **No change** to any handler's logic, queries, idempotency, or order of
  operations.

## Patterns observed

- **On a money path, separate the structural move from the behavioural one and
  ship the move first under a parity audit.** Relocating verbatim (then grepping
  the captures / notifies / table-ops for parity) gets the route from
  god-handler to dispatch switch at near-zero risk, and isolates the
  repo-routing change as a testable follow-up rather than smuggling it inside a
  big diff.

## Follow-ups

- **P3-2 remainder (behavioural):** route the inline `admin.from(...)` writes in
  the checkout / charge handlers through the existing payment repos
  (`eventTeamPaymentRepo`, `eventTeamRegistrationRepo`, and new methods on the
  attendee/tip/sponsor side if needed) — **with characterization tests first**
  (mock Stripe events + admin client; assert the row transitions). The team
  helpers already go through aggregates; the attendee/tip/sponsor branches are
  the raw-SQL ones left.
- Remaining Phase 5: P3-1 remainder (form-state context), P3-3 (payment-handler
  decision — a "pick one" like P2-4).

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(domain 307, application 47, web 55, infra 23; lint 0 errors, pre-existing
warnings only; build 8/8). No DB change.
