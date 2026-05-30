# Phase 5 inc. 3 — new-event-form decomposition (P3-1, partial) (2026-05-30)

## Context

Third Phase 5 increment. Chips at **P3-1** (oversized client form —
[architecture.md](../audits/architecture.md)): `new-event-form.tsx` was
**1,402 LOC** with 21 hook calls, the whole create-event wizard in one file. The
form's branch components (`OpenPlayBody`, `PricingSubsection`,
`PaymentSettingsSubsection`, `ExternalFields`, …) already existed as
parameterized functions — they were just all crammed into the one file, with a
note ("kept in this file to avoid a directory of one-use helpers") that the
audit's DRY observation directly overrides: they're _not_ one-use, because
`edit-event-form.tsx` (592 LOC, same form shape) should share them.

## Decisions

- **Relocated the already-parameterized components into `_components/`, did NOT
  touch the stateful orchestrator.** The main `NewEventForm` (≈660 LOC, 23
  hooks) holds all the form state and prop-drills it into the branch
  components; decomposing _it_ (extract the inline section JSX behind a
  form-state context) is the larger, behaviour-sensitive piece. This increment
  is the safe, mechanical half: move the leaf/branch components out verbatim —
  no logic, state, or markup change — so the file shrinks and the pieces become
  reusable. Framed as **partial P3-1**.
- **Grouped into 4 cohesive files**, not one-per-component:
  - `_components/form-primitives.tsx` (177) — style tokens (`labelClass`,
    `inputClass`, `cardClass`, …), the `val`/`chk` form-value helpers, the
    `CapacityKind` type, and the small shared controls (`SkillTierSelect`,
    `SubmitButton`, `TypeCard`, `SegmentedControl`). The shared base both the
    form and the section components import.
  - `_components/payment-fields.tsx` (316) — `StripeOnboardingBanner`,
    `RefundWindowField`, `PricingSubsection`, `PaymentSettingsSubsection`
    (grouped because the two subsections share the two leaf components).
  - `_components/open-play-body.tsx` (154) and `_components/external-fields.tsx`
    (127) — the two non-tournament form branches (the tournament branch already
    lives in the existing `divisions-repeater.tsx`).
- **`new-event-form.tsx`: 1,402 → 698 LOC** — now imports + the
  `NewEventForm` orchestrator only.
- **Byte-for-byte JSX preserved.** Each component moved unchanged; only added
  the `'use client'` directive (every extracted file uses event handlers /
  `useFormStatus`, so each is its own client module) and the imports it needs.
  Typed `setPositionCounts` with explicit `Dispatch<SetStateAction<…>>` instead
  of the ambient `React.Dispatch` for an import-clean file.
- **No tests.** Pure relocation of presentational React components — no logic,
  no domain rule; the build + typecheck verify the wiring. (UI behaviour is
  unchanged; a full e2e of the create flow is out of scope for a code move.)

## Changes

- **Web (new):** `events/new/_components/{form-primitives,payment-fields,open-play-body,external-fields}.tsx`.
- **Web:** [new-event-form.tsx](../../apps/web/src/app/events/new/new-event-form.tsx)
  — removed the moved helpers + components, added imports; 1,402 → 698 LOC.
- **No change** to the server action, form field names, or any runtime
  behaviour.

## Patterns observed

- **"Decompose a god-component" is often two jobs: relocate the already-separate
  parts (cheap, safe) and lift the shared state into a context (the real work).**
  Doing the relocation first banks ~50% of the LOC win + unblocks reuse
  (`edit-event-form`) with near-zero risk, and leaves the riskier state-context
  refactor as a clearly-scoped follow-up.

## Follow-ups

- **P3-1 remainder:** lift `NewEventForm`'s inline section JSX (templates,
  basics, when-&-where, visibility) behind a shared form-state context to get
  the orchestrator under the ADR-0005 ~200-LOC target; then have
  `edit-event-form.tsx` (592 LOC) consume the same `_components/` pieces (the
  audit's DRY goal). Deferred — behaviour-sensitive, wants the create/edit flows
  exercised.
- Remaining Phase 5: P3-2 (Stripe webhook decomposition — wants characterization
  tests first), P3-3 (payment-handler decision — a "pick one" like P2-4).

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(domain 307, application 47, web 55, infra 23; lint 0 errors, pre-existing
warnings only; build 8/8). No DB change.
