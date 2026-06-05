# Surface event-payment readiness before submit, not on it (2026-06-03)

## Context

User report on the create-event flow: a host who hasn't finished Stripe
onboarding could enter a price, leave the "I'll collect payment myself
(off-platform)" box unticked, and only learn they couldn't charge **after**
hitting submit — the server (`requireHostChargesEnabled` in
[apps/web/src/app/events/new/actions.ts](../../apps/web/src/app/events/new/actions.ts#L371-L377))
rejects the paid + on-platform + no-Stripe combination and rolls the event row
back. The existing `StripeOnboardingBanner` was a passive `role="status"` note
that was easy to skip past, and its copy literally promised the dead-end
("paid events without Stripe will be rejected at submit"). This is the same
class of problem as the 2026-06-03 actionable-visible-form-alerts bundle: an
error that arrives too late and offers no in-place path to fix it.

## Decisions

- **Escalate the banner reactively rather than block submit.** Chose a
  two-state `StripeOnboardingBanner` (calm `info` heads-up → actionable
  `warning` alert once a price is entered without off-platform) over disabling
  the submit button, because a disabled button with no inline reason is its own
  dead-end. The server gate stays as the backstop. The warning offers both
  exits in one click: "Finish Stripe setup" (link to `/profile/billing`) or
  "collect payment yourself" (ticks the off-platform box via the existing
  `setPaymentsOffPlatform` lifted in the parent form).
- **Reused the shared `Alert` primitive** ([apps/web/src/components/alert.tsx](../../apps/web/src/components/alert.tsx))
  for both states (`info` / `warning`) instead of hand-rolling banner markup —
  it already carries the role mapping (`warning`/`error` → `alert`, else
  `status`), icon, and dark-mode tokens.
- **Made price-awareness reactive in both pricing shapes.** Open-play has a
  single top-level price, so `PricingSubsection` now owns a controlled
  `priceUsd` state (was uncontrolled `defaultValue`; behavior-preserving for
  echo-on-error since the form only remounts on template apply). Tournament /
  league prices live per-division in `DivisionsRepeater`, a sibling of the
  payment-settings subsection — so the repeater reports "any division priced"
  up via a new optional `onPaidChange` callback fired from its mutating
  handlers (event-handler closures, **not** an effect — avoids
  `react-hooks/set-state-in-effect`), and `FormatSection` holds the
  `hasPaidDivision` state and threads it into `PaymentSettingsSubsection`.

## Changes

- [apps/web/src/app/events/new/\_components/payment-fields.tsx](../../apps/web/src/app/events/new/_components/payment-fields.tsx)
  — `StripeOnboardingBanner` rebuilt on `Alert` with `blocking` +
  `onCollectOffPlatform` props; `PricingSubsection` tracks a controlled price
  and drives the blocking state; `PaymentSettingsSubsection` gains a
  `hasPaidDivision` prop and drives the same.
- [apps/web/src/app/events/new/\_components/divisions-repeater.tsx](../../apps/web/src/app/events/new/_components/divisions-repeater.tsx)
  — optional `onPaidChange(anyPaid)` reported from a `commit()` helper wrapping
  add / remove / patch.
- [apps/web/src/app/events/new/\_components/format-section.tsx](../../apps/web/src/app/events/new/_components/format-section.tsx)
  — holds `hasPaidDivision`, wires repeater → payment-settings subsection.

## Patterns observed

- **Sibling components that share a derived signal lift it to their common
  parent via a callback, not an effect.** The repeater already owns its row
  state; reporting `anyPaid` from the user-event handlers (where the next row
  set is known synchronously) keeps it out of an effect and dodges the
  `react-hooks/set-state-in-effect` ratchet.

## Follow-ups

- **Edit-event form has the same gap and is worse off.**
  [apps/web/src/app/events/[id]/edit/edit-event-form.tsx](../../apps/web/src/app/events/[id]/edit/edit-event-form.tsx)
  is a standalone form that doesn't even receive `canCollectPayments` — it
  always shows on-platform controls and relies entirely on the server gate
  ([edit/actions.ts](../../apps/web/src/app/events/[id]/edit/actions.ts#L221-L232)).
  Deferred because the edit form doesn't reuse the `new/_components` payment
  components; porting this fix means either sharing the components or
  duplicating the banner there. Out of scope for the create-flow request.
