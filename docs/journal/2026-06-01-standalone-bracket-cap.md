# Standalone-bracket free-tier cap (R-3) (2026-06-01)

## Context

Second of the greenlit monetization re-eval levers (after R-5, the tip-fee drop).
Standalone brackets (ADR 0025 — run a tournament without hosting an event)
shipped uncapped. The [monetization re-eval](../audits/monetization.md) R-3 called
for a free cap on this **net-new** surface: a clean, no-clawback lever that
monetizes the tournament-organizer power user without touching anything that was
previously free.

## Decisions

- **"1 _active_ bracket," not "1 bracket ever."** "Active" = `status` in
  `setup`/`active` (not `completed`). A Free host keeps their full history of
  completed tournaments; only an in-progress bracket occupies the slot, and
  finishing or deleting it frees it. Chose this over a total-count cap because it
  protects the community use case (you can run one tournament after another) and
  reads honestly as "one at a time."
- **Cap in the web layer, not the domain.** Mirrors `validateHostPaidEventCap`:
  the rule lives in `apps/web/src/lib/standalone-bracket-cap.ts`, Pro / platform
  admins short-circuit via `hasProBenefits`, and the `Bracket` aggregate +
  handlers stay Pro-unaware (Pro is a payments/web concern, not a volleyball
  rule). Consistent with how every other event-level Pro gate is drawn.
- **Reuse `listByOwner`, don't add a port method.** The cap only runs for non-Pro
  hosts (Pro short-circuits before any read), who have a handful of brackets at
  most, so counting non-completed rows off the existing `listByOwner` summary
  projection is cheap and avoids churning the `BracketRepository` interface + its
  two test fakes for a web-layer concern. (If a Free host ever accumulates enough
  completed brackets for this to matter, promote to a DB `count` then.)
- **Two enforcement points.** The `createStandaloneBracketFromForm` action is the
  hard gate (redirects to `/brackets/new?notice=cap` for a crafted/raced submit);
  the `/brackets/new` page is the proactive UX — it renders an upgrade card
  instead of the format picker when already capped, so a Free host sees the
  upsell rather than filling the form and bouncing. Same shape as the
  visibility / refund-window Pro nudges.

## Changes

- [apps/web/src/lib/standalone-bracket-cap.ts](../../apps/web/src/lib/standalone-bracket-cap.ts)
  — new `validateActiveBracketCap()` + `FREE_ACTIVE_BRACKET_CAP = 1`.
- [apps/web/src/lib/standalone-bracket-cap.test.ts](../../apps/web/src/lib/standalone-bracket-cap.test.ts)
  — new (Pro uncapped + no count; active blocks; completed don't count; empty ok).
- [apps/web/src/app/brackets/actions.ts](../../apps/web/src/app/brackets/actions.ts)
  — enforce in `createStandaloneBracketFromForm` (outside the try; `redirect`
  throws).
- [apps/web/src/app/brackets/new/page.tsx](../../apps/web/src/app/brackets/new/page.tsx)
  — proactive upgrade card when capped.
- [labels.ts](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/labels.ts)
  — `cap` NOTICE_LABEL entry (fallback notice for the action redirect).
- Copy: [pricing/page.tsx](../../apps/web/src/app/pricing/page.tsx) (feature lists
  - comparison row + FAQ), [docs/features.md](../features.md) (Pro-unlocks table).
- Records: [ADR 0025 addendum](../adr/0025-standalone-brackets.md), monetization
  audit R-3 + remediation log.

## Patterns observed

- **The cap-helper shape is now a small family.** `host-paid-event-cap.ts` and
  `standalone-bracket-cap.ts` are the same shape: `server-only`, `hasProBenefits`
  short-circuit, count, compare, return `{ ok } | { ok, reason }`. If a third
  free-tier cap lands (e.g. R-2 media volume), factor the shape — until then two
  is not yet a pattern worth abstracting.

## Follow-ups

- Greenlit and still open: **R-2** (media/storage volume tiering — needs free-tier
  numbers chosen first), **R-1 Phase 6** (the `score-live` Playwright spec).
