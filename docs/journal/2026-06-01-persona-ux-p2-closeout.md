# Persona-UX P2 closeout: pricing → login → guest fields → auth cluster → host divisions (2026-06-01)

## Context

Continuation of the [persona-ux audit](../audits/persona-ux.md) remediation.
The earlier bundles (2026-05-31b–d, 2026-06-01) had ratchet-locked the two big
vocabularies (`primaryButtonClass` via CC-1, `field-styles.ts` via CC-2) and
fixed the V-1 dead link + V-4 anon host gate. This pass walked the remaining
standing backlog item-by-item until **every P2 was resolved**, plus two P3s
(CC-5, partial H-3). One topic, several small surface bundles — logged in the
audit's remediation log (2026-06-01b–f); this entry is the narrative thread.

## Decisions

- **`/pricing`: Filled (recommended) vs. Outlined (alternative).** Chose
  `secondaryButtonClass` (M3 Outlined) for the Free-tier CTA, "Manage
  subscription", and the monthly-trial submit over keeping the neutral
  `border-border-base hover:bg-fg/5` recipe, because the pricing card's whole job
  is to contrast Free vs. Pro — Outlined-alternative / Filled-recommended is the
  canonical M3 read. Kept the **yearly** submit Filled to preserve the "save
  $20/yr" nudge.
- **Login: `TextField`, not `field-styles.ts`.** Chose the richer M3 outlined
  `TextField` over the bare field recipe because the login inputs had **no**
  `htmlFor`/`id` wiring at all — `TextField` fixes the a11y for free and the
  auth front door is the highest-intent page, worth the chassis. Elsewhere
  (guest fields) the bare recipe was the right call (see next).
- **Guest fields: `field-styles.ts` + no `'use client'`.** Chose to extract
  `GuestSignupFields` on the bare recipe (matching the free form, which was
  already on it) rather than `TextField`, and deliberately **omitted** the
  `'use client'` directive so the one component renders inside both the client
  `GuestSignupForm` and the server `PaidTicketPanel`. Parameterized the
  free-vs-paid difference (`emailRequired`) instead of forking.
- **Auth cluster: Outlined + Filled pair, tonal for the claim nudge.** Chose
  `secondaryButtonClass` for "Sign in" (was a bare nav text-link on desktop, a
  hand-rolled outlined button on mobile) so the Sign in / Sign up pair matches
  across both surfaces, and `tonalButtonClass` (Filled-tonal, medium emphasis)
  for the anon "Finish creating your account" nudge so it sits beside the Filled
  "Sign up" without competing.
- **Host divisions: `FormModal` over inline expand.** Chose to move the 16-field
  `DivisionForm` into `FormModal` (per-row Edit + "+ Add division") over the
  inline `editingId`/`adding` `<details>`-style expand, because the inline form
  shoved the page around for a focused subtask — the same argument that drove the
  walk-in team form into a modal. `CloseOnSettled` closes on action-settle;
  `ModalActions` owns the Cancel/Submit row; Radix owns each modal's open state,
  so the local state machine is deleted.
- **Remove demoted by removing chrome, not color.** Chose to keep Remove's
  destructive red but strip its border/fill (vs. Edit's `secondaryButtonClass`
  outline) so it reads as the quieter, secondary action while staying ≥44px. No
  canonical error-button class exists yet (`errorButtonClass` is a tracked P3),
  so the red text-button is hand-rolled with a comment pointing at the backlog.
- **H-1 was already done.** Verified rather than re-implemented:
  `form-primitives.tsx` already re-exports `field-styles.ts` (CC-2) and its
  submit uses `primaryButtonClass` (CC-1). Flipped the status after confirming
  end-to-end; the remaining local controls (`SegmentedControl`, `TypeCard`) are
  genuine custom widgets, not vocabulary drift.

## Changes

- `app/pricing/page.tsx` — 4 CTAs → `secondaryButtonClass`; dropped a vestigial
  `sm:grid-cols-2` that left the monthly button half-width (2026-06-01b).
- `app/login/page.tsx` — email + password inputs → `TextField`; "Forgot
  password?" moved out of the `<label>` (2026-06-01c).
- `app/events/[id]/_components/guest-signup-fields.tsx` — **new** shared
  name+email component (`emailRequired`, optional `errors`); consumed by
  `guest-signup-form.tsx` (free) and `paid-ticket-panel.tsx` (paid), removing
  ~30 lines of forked markup + a local `<Err>` (2026-06-01d).
- `components/site-header.tsx` + `components/mobile-menu.tsx` — Sign in →
  `secondaryButtonClass`; anon claim nudge → `tonalButtonClass` (2026-06-01e).
- `app/events/[id]/_components/host-divisions-manager.tsx` — inline expand →
  `FormModal` (Edit + Add); row actions → `secondaryButtonClass` + `tap-target`,
  Remove demoted; modal Cancel/Submit → canonical (2026-06-01f).
- Audit bookkeeping: `docs/audits/persona-ux.md` (findings + log + backlog),
  `docs/audits/README.md` (index row), `docs/audits/events-page-ux.md`
  (divisions-manager carry-over marked done).

## Patterns observed

- **Re-export of a shared recipe silently resolves a finding.** H-1 looked open
  but had been closed by CC-2's `form-primitives.tsx` re-export — the finding's
  status just lagged the code. When a vocabulary lives behind a re-export, audit
  the re-export, not just the call sites, before assuming drift remains.
- **`'use client'` is a liability for a leaf field component.** Omitting it let
  `GuestSignupFields` serve a client form and a server panel from one file. The
  AGENTS.md pitfall is about _passing functions_ across the RSC boundary; a
  directive-less component that only renders inputs sidesteps it entirely.
- **No `errorButtonClass` yet keeps biting.** Both `ConfirmSubmitButton`'s
  destructive confirm and the divisions Remove hand-roll `bg-red-600`/
  `text-red-600`. The third hand-roll is the signal to build the primitive —
  tracked in the persona-ux P3 backlog.

## Follow-ups

- **H-3 remainder** — the `text-primary hover:underline` row-action pattern in
  the group/team **member rows** still needs `secondaryButtonClass`/`textButtonClass`
  - `tap-target` (divisions done this pass). [persona-ux.md H-3](../audits/persona-ux.md).
- **Secondary-button convergence** — **re-scoped 2026-06-01h:** re-measure found
  84 `hover:bg-fg/5`+border sites (not ~30), heterogeneous — card rows, radio-card
  `<label>`s, the Google button, and toggle chips are _not_ secondary buttons and
  must stay neutral, so a blanket `→ secondaryButtonClass` (primary-tinted) is
  wrong. Needs a curated "button vs. neutral surface" split, likely a _neutral_
  outlined recipe. [persona-ux.md P3 backlog](../audits/persona-ux.md).
- **`errorButtonClass` primitive** — ✅ **done 2026-06-01g** (persona-ux.md log):
  added a Filled destructive variant on the M3 `error` role tokens and adopted it
  in the 5 filled-destructive call sites (`ConfirmSubmitButton` + 4 danger-zone
  panels). **2026-06-01i:** completed the family — `errorOutlinedButtonClass`
  (danger-zone "Delete…" triggers) + `errorTextButtonClass` (divisions Remove).
  Remaining: an `errorTonalButtonClass` for the tinted community report buttons.
  [persona-ux.md backlog](../audits/persona-ux.md).
- **`StatusPill` primitive (P-2)** — ✅ **done 2026-06-01h** (persona-ux.md log):
  extracted with a `tone` prop; the four ad-hoc RSVP/payment pills now render it.
- **CC-3 `text-white` re-measure** — ✅ **done 2026-06-01j** (persona-ux.md log):
  drift table said 64; reality was 26 total / 5 on `bg-primary`. Cleared all 5
  (one was a `hover:opacity-90` ratchet miss → `primaryButtonClass`; rest →
  `text-primary-fg`). `bg-primary`+`text-white` now 0.
