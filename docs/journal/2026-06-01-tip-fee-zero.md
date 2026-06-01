# Tips take no platform fee (R-5) — and an R-1 correction (2026-06-01)

## Context

Monetization re-evaluation (the 2026-05-31 status block in
[docs/audits/monetization.md](../audits/monetization.md)) re-ran the lens after a
week of cost-center feature shipping (chat, media, avatars, live scores,
MapTiler). The user reviewed the findings and greenlit four levers; this bundle
ships **R-5** and corrects a factual error the re-eval introduced about **R-1**.

- **R-5 — tip-jar fee posture.** Tips charged the same 5% / 2.5% platform fee as
  tickets. A tip is a discretionary attendee→host transfer the platform didn't
  broker, so skimming it is the weakest possible trust signal. User asked to
  "drop/cap it as a trust signal — whatever you feel is a good idea."
- **R-1 correction.** The re-eval filed live match scoring (ADR 0023) as "the
  strongest _unbuilt_ conversion lever." Tracing the code showed it is in fact
  **already built** — phases 1–5 shipped 2026-05-30. The "unbuilt" framing came
  from the ADR's stale `Status: Proposed` and a stale one-line memory index note
  (the memory _body_ correctly said "ALL 5 PHASES BUILT"). Both fixed.

## Decisions

- **Drop the tip fee to 0%, not a cap.** Chose a clean "we take nothing on tips"
  over a "$0.30 + 0% after" cap because the cap is harder to explain and dilutes
  the signal. Pre-launch tip volume is small, so forgone revenue is negligible
  against the goodwill. ADR 0014 requires an amendment for any fee-rate change —
  added one rather than a silent constant bump.
- **Named helper, not an inline `0`.** `tipPlatformFeeCents()` returns 0 and is
  unit-tested — the single, testable place to change if a capped tip fee is ever
  warranted. Mirrors the discipline ADR 0014 applies to the ticket-fee rate.
- **Omit `application_fee_amount` when 0, don't send `0`.** Guarded in the shared
  `createDestinationCheckoutSession` so the destination charge transfers the full
  tip and we dodge any Stripe edge-case validation on a zero fee. Benefits any
  other no-fee flow (e.g. a free pass) too.
- **Keep Stripe's processing fee honest.** We don't take a fee, but Stripe still
  takes ~2.9% + 30¢ on any card charge — the tip UI says so explicitly rather
  than implying the host nets 100%. We do **not** pass it to the tipper as a line
  item (a fee line would dwarf a small tip).
- **R-1: flip the ADR status, don't rebuild.** ADR 0023 → `Accepted — implemented`
  with the Phase-6 e2e called out as the only remainder. No code change to the
  (working, typecheck-green) feature.

## Changes

- [apps/web/src/lib/event-pricing.ts](../../apps/web/src/lib/event-pricing.ts) —
  new `tipPlatformFeeCents()` (returns 0, documented).
- [apps/web/src/lib/event-pricing.test.ts](../../apps/web/src/lib/event-pricing.test.ts)
  — new unit test (tier-independent 0; sibling modules mocked to isolate the
  import graph, mirroring `analytics.test.ts`).
- [apps/web/src/app/events/[id]/tip-actions.ts](../../apps/web/src/app/events/%5Bid%5D/tip-actions.ts)
  — use `tipPlatformFeeCents`; stores `platform_fee_cents = 0`.
- [apps/web/src/lib/checkout-session.ts](../../apps/web/src/lib/checkout-session.ts)
  — omit `application_fee_amount` when ≤ 0.
- Copy: [tip-jar.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/tip-jar.tsx),
  [pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx) (feature lists +
  comparison table split into "tickets" / "tips" rows + FAQ),
  [profile/billing/pro/page.tsx](../../apps/web/src/app/profile/billing/pro/page.tsx),
  [docs/features.md](../features.md).
- Records: [ADR 0014 amendment](../adr/0014-monetization-strategy.md),
  monetization audit R-5 + remediation log.
- R-1 correction: [ADR 0023](../adr/0023-live-match-scoring.md) status,
  monetization audit R-1 + headline, [audits README](../audits/README.md) index,
  memory.

## Patterns observed

- **Stale ADR status is a real foot-gun.** ADR 0023 sat at `Proposed` through
  five shipped phases; combined with a stale memory index line it produced a
  confidently-wrong audit finding. Lesson reinforced: trace the code before
  grading a "build this" finding — the journal/ADR status is a hint, not ground
  truth. Flip ADR status to `Accepted/implemented` when a feature lands.
- **One canonical fee helper per surface.** Putting the 0 behind a named function
  kept the change to one line of behavior + one test, and leaves the ticket-fee
  path (`platformFeeCentsFor`) untouched.

## Follow-ups

- R-1 Phase 6: author a `score-live` Playwright spec (score → public live update
  → finalize) against dev — the only remaining live-scoring work.
- Other greenlit levers still open: **R-3** (standalone-bracket free cap of 1 +
  Pro unlimited), **R-2** (media/storage volume tiering — needs free-tier numbers
  chosen).
