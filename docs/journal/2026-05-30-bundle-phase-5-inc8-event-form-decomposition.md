# Phase 5 inc. 8 — event-form decomposition + cross-form DRY (P3-1 resolved) (2026-05-30)

## Context

Eighth (and final-for-the-backlog) Phase 5 increment. Closes **P3-1** — the last
open finding from the 2026-05-29 architecture re-audit. inc. 3 had relocated the
create-event form's already-parameterized branch/leaf components into
`_components/`, taking `new-event-form.tsx` from **1,402 → 698 LOC**, but
deferred two behaviour-sensitive halves:

1. the stateful `NewEventForm` orchestrator still held ~660 LOC of inline section
   JSX (the audit's ADR-0005 ~200-LOC target), and
2. `edit-event-form.tsx` (592 LOC) still duplicated the address block + style
   tokens instead of reusing the shared pieces (the DRY half).

Zachary picked P3-1 to finish the backlog.

## Decisions

- **Explicit section props, not a form-state context.** The audit suggested
  "lift the section JSX behind a form-state context." I deliberately went with
  **explicit-props section components** instead, for two reasons:
  1. **Consistency.** The inc.-3 components (`PricingSubsection`,
     `OpenPlayBody`, `PaymentSettingsSubsection`, `ExternalFields`) already take
     `fieldErrors` / `values` / `submitted` as explicit props. Introducing a
     context now would make half the sections context-driven and half
     prop-driven — worse than either alone.
  2. **A context wouldn't pay for itself.** The create and edit forms don't share
     a state shape (`createEventAction` echoes back `values`/`submitted` +
     templates + by-position capacity; `editEventAction` hydrates controlled
     inputs from `initial` and has none of those). A shared context couldn't
     have served both, so it wouldn't have enabled the cross-form DRY that's the
     more valuable half of P3-1. The prop "drilling" the audit worried about is,
     in practice, one level deep (orchestrator → section) and reads clearly.
- **Six section components, byte-for-byte JSX.** Same proven shape as inc. 3 —
  the JSX moved verbatim (classes, names, `defaultValue`, `fieldA11y` keys all
  preserved), only the home changed. `templates-section` additionally absorbs
  its own state (the 5 template hooks/refs) since it's self-contained — it reads
  the parent `<form>` via the passed `formRef` and touches no other form state.
- **`LocationFields` is the one genuinely-shared component.** The address block
  (autocomplete + addressLine + city/region/postal/country) was near-identical
  across both forms — the clearest DRY win. Parameterized over the three real
  differences: `errorPrefix` (`'location.'` create vs `''` edit), `collapsible`
  (create collapses the detail fields behind an "Edit address details" toggle;
  edit always shows them), and an optional `searchHelp` line (create only).
- **The one benign behaviour delta, surfaced deliberately.** The shared
  `LocationFields` renders `FieldError` + `fieldA11y` on all five address fields.
  The edit form previously had those only on `addressLine`. This is inert:
  `FieldError` returns `null` without a matching error, and `editEventAction`
  only ever emits `title`/`endsAt`/`maxSpots`/`addressLine` errors — so
  city/region/postal/country never render an error. The only DOM change is
  `aria-invalid="false"` gaining presence on four edit inputs, which the a11y
  audit would call an improvement, not a regression.

## Changes

- **New shared component:**
  [`_components/location-fields.tsx`](../../apps/web/src/app/events/new/_components/location-fields.tsx)
  — used by both forms.
- **New create-form section components** (all in
  [`events/new/_components/`](../../apps/web/src/app/events/new/_components/)):
  `templates-section`, `event-type-section`, `basics-section`,
  `when-where-section` (composes `LocationFields`), `format-section` (wraps the
  inc.-3 `OpenPlayBody`/`ExternalFields`/`DivisionsRepeater`/payment subsections
  - owns the `show*` derived flags + the hidden capacity inputs),
    `visibility-section`.
- [`new-event-form.tsx`](../../apps/web/src/app/events/new/new-event-form.tsx)
  **698 → 209 LOC** — now `useFormState` + controlled state + `applySuggestion`
  - section composition + the sticky footer. (1,402 → 209 across inc. 3 + 8,
    **−85%**.)
- [`edit-event-form.tsx`](../../apps/web/src/app/events/%5Bid%5D/edit/edit-event-form.tsx)
  **592 → 526 LOC** — imports `inputClass`/`labelClass` from `form-primitives`
  and the shared `LocationFields` (dropped its local copies + its inline address
  fieldset). Kept its own `SubmitButton` ("Save changes") + `RefundWindowField`
  (different label/signature from the create-form versions — not worth forcing a
  shared abstraction).
- **No tests added.** These are presentational client components with no isolable
  logic (per AGENTS.md "skip the test for a one-off scaffold / pure plumbing");
  the regression surface is visual, covered by the build + a manual pass. No
  domain/application/DB change.

## Patterns observed

- **"Lift behind a context" isn't always the right read of a decomposition
  finding.** When the existing extracted siblings already pass props, and the
  forms that would share the context don't share a state shape, explicit props
  are the lower-risk, more-consistent move. The measurable goal (orchestrator
  under the ADR target) and the DRY goal were both better served by a shared
  _presentational_ component (`LocationFields`) than by a shared _state_ context.
- **A shared component for two near-identical blocks beats two parameterized
  copies.** The address block was the only part genuinely identical across the
  two different forms — so it's the only part that became shared. Forcing the
  rest (different field sets, different actions) into shared components would have
  been false DRY.

## Follow-ups

- **The 2026-05-29 re-audit backlog is now fully closed** (P1 + all six P2 + all
  four P3). Remaining deferrals are the noted lower-priority design calls: the
  per-surface `EventDetailReadModel` split, and true multi-statement `save()`
  atomicity (a broader RPC effort).
- The create-form orchestrator is 209 LOC — just over the ~200 "ideal." The
  residual is unavoidable controlled-state wiring (address/datetime/capacity
  state legitimately lives at the form root because multiple sections read it).
  A future `useEventFormState` hook could shave it under 150 if desired, but
  that's gold-plating, not a finding.
- **Visual parity not yet eyeballed** — the build compiles both routes, but a
  manual pass on `/events/new` (open-play + tournament + external; templates
  apply/save; address autocomplete + collapse) and `/events/[id]/edit` is worth
  doing before shipping, since the regression surface here is visual.

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(domain 350, application 47, web 79, infra 41; lint 0 errors — the new form files
added zero warnings; build 8/8, both `/events/new` and `/events/[id]/edit`
compiled). No DB change. E2E not run (not in the default chain; no covered
journey changed).
