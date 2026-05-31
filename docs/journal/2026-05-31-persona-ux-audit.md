# Persona UX/UI audit + first quick-win bundle (2026-05-31)

## Context

User feedback: "the UI doesn't cater to the different personas" and a request
to keep "action items, edit forms, etc." clean and aligned to design standards.
Scoped (via clarifying questions) to a **written audit + quick wins**, weighted
to the **host**, **visitor→signup**, and **player/attendee** journeys.

No existing audit covered site-wide UX through a persona + action-item-clarity
lens: [events-page-ux.md](../audits/events-page-ux.md) is page-scoped and
[m3-alignment.md](../audits/m3-alignment.md) tracks token conformance (it already
records ~5% primitive adoption). New file
[docs/audits/persona-ux.md](../audits/persona-ux.md) reads the same drift through
the user-flow lens and prioritizes the conversions that move a real journey.

## Decisions

- **New audit file over folding into m3-alignment.md.** The persona/clarity lens
  is a distinct question ("does the same action read the same across a persona's
  screens?") from token conformance. Cross-linked both ways instead of
  duplicating the adoption count.
- **Fixed the `/signup` P1 by repointing, not by adding a route.** Every other
  entry point already uses `/login?mode=sign-up`; adding a `/signup` page would
  fork the auth surface. The dead link was hidden because `'/signup' as Route`
  suppressed the `typedRoutes` build error — noted in the audit as the reason it
  escaped CI.
- **Migrated `ConfirmSubmitButton` first.** It's the single most-reused action
  button (RSVP / Leave / Buy / Cancel / refund across every persona), so aligning
  its classes propagates the canonical CTA everywhere in one edit. Chose
  `primaryButtonClass('md')` for the trigger + non-destructive confirm,
  `secondaryButtonClass('md')` for cancel.
- **Kept destructive confirm red, hand-rolled.** There's no canonical
  error/destructive button class in `primary-button.tsx` yet. Aligned it to the
  same `md` + state-layer shape and logged "add `errorButtonClass`" as backlog
  rather than inventing one mid-bundle (partial pattern > no pattern risk).
- **Quick wins kept to 5 files.** Migrated the highest-visibility/highest-reuse
  CTAs (ConfirmSubmitButton, create-event submit, landing page, events-browse
  header + empty state). Deliberately did **not** start the 17-file field-vocab
  convergence or the FormModal/divisions-manager refactor — those are graded P2/P3
  backlog so the bundle stays reviewable.

## Changes

- `docs/audits/persona-ux.md` — new audit (persona model, drift table, findings
  CC-1..5 / V-1..4 / P-1..3 / H-1..3, remediation log).
- `docs/audits/README.md` — index row added.
- `apps/web/src/components/confirm-submit-button.tsx` — trigger + modal
  confirm/cancel now use `primaryButtonClass`/`secondaryButtonClass`; destructive
  confirm aligned to the same shape.
- `apps/web/src/app/events/new/_components/form-primitives.tsx` — create-event
  `SubmitButton` → `primaryButtonClass('md')`.
- `apps/web/src/app/page.tsx` — hero / host-pitch / footer CTAs →
  `primaryButtonClass`/`secondaryButtonClass`; **P1 fix:** footer "Create account"
  `/signup` → `/login?mode=sign-up`.
- `apps/web/src/app/events/page.tsx` — header "Host an event" + `EmptyState` CTAs
  → canonical classes.

## Patterns observed

- **Primitives existing isn't adoption.** `primaryButtonClass` (Bundle 127) and
  `TextField` (Bundle 7) are both well-built but lose to copy-paste because the
  hand-rolled recipe is shorter to type at the call site. Measured 68 hand-rolled
  primary buttons / 51 files vs 11 canonical; 17 forked `inputClass` vs 3
  `TextField`. The fix has to include a **ratchet** (per m3-alignment.md) or drift
  re-accumulates.
- **`as Route` casts hide broken links from `typedRoutes`.** The `/signup` 404
  compiled cleanly for that reason. Worth a lint rule / grep sweep for
  `as Route` on string literals.
- **Per-surface field vocabularies diverge on a11y, not just looks.** Several
  local `inputClass` forms omit the focus-visible ring / `aria` wiring that
  `TextField` + `fieldA11y` provide for free — so the consistency debt is also an
  accessibility debt.

## Follow-ups

All graded in [persona-ux.md](../audits/persona-ux.md) remediation log:

- **P2:** finish the CTA migration (header pills + ~45 files), converge the 17
  field vocabularies / `TextField` adoption, `window.confirm`→`ConfirmSubmitButton`
  in the divisions manager, shared `GuestSignupFields`, login-page primitives.
- **P3:** `text-white`→token sweep (folds into the CTA migration), FormModal
  conversion of inline edit forms (also in
  [events-page-ux.md](../audits/events-page-ux.md)), anon→claim host gate,
  `StatusPill` primitive, row-action tap targets, add `errorButtonClass`.
