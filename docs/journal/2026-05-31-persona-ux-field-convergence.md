# Persona UX bundle 2: field-vocabulary convergence + confirm-dialog (2026-05-31b)

## Context

Second bundle off [docs/audits/persona-ux.md](../audits/persona-ux.md), picking
up the P2 the user prioritized: **CC-2** (17 forked local `inputClass`/`labelClass`
definitions — the "edit forms look hand-made" half of the original complaint),
folding in **CC-4** (the one `window.confirm` that diverged from the app's in-app
confirm dialog) since it lived in the same host surface (`host-divisions-manager`).
Follows [2026-05-31-persona-ux-audit.md](2026-05-31-persona-ux-audit.md) (bundle 1:
P1 dead link + `ConfirmSubmitButton`/CTA alignment).

## Decisions

- **Shared class-string module over migrating everything to `TextField`.** Chose a
  plain [field-styles.ts](../../apps/web/src/components/field-styles.ts)
  (`fieldInputClass`/`fieldLabelClass`/`fieldSubLabelClass`/`fieldHintClass`/
  `fieldErrorClass`) over porting all 17 forms to the `TextField` primitive,
  because **these forms are select-heavy** (skill tier, surface, division mode,
  capacity, …) and `TextField` only wraps `<input>`/`<textarea>`. A bare recipe
  that styles `<select>` identically is what actually makes a whole form look
  coherent. Tuned the recipe to match `TextField`'s chassis tokens (`rounded-md
border border-border-base bg-surface px-3 py-2 text-sm`) so the two can mix in
  one form without a visual seam — `TextField` stays the richer option for fields
  that want adornments / auto-wired `aria`.
- **Import-with-alias, zero call-site churn.** Each form keeps its existing local
  names (`inputClass`, `labelClass`, …) via `import { fieldInputClass as
inputClass } from '@/components/field-styles'`, so only the `const` definitions
  were deleted — every `className={inputClass}` reference was untouched. Kept the
  diff mechanical and reviewable.
- **`form-primitives.tsx` re-exports rather than each event-section importing
  directly.** The create/edit-event sections import `inputClass`/`labelClass` from
  `form-primitives`; making it `export const inputClass = fieldInputClass` means
  all of them inherited the convergence with one edit and no new imports.
- **Two deliberate non-conversions, documented as exceptions.**
  `match-row.tsx` (inline schedule-table cell: `rounded px-2 py-1`, no label) and
  `event-filter-form.tsx`'s `selectClass` (compact filter-bar select) are a
  different control class than labeled form fields — the block recipe (`mt-1
block w-full px-3 py-2`) would break their layouts. Logged in the audit so they
  read as decisions, not misses. Net: 16 converged, 2 exceptions.
- **Accepted a small density change in the host grids.** divisions-repeater and
  host-divisions-manager moved from `px-2 py-1.5` + `text-xs` labels to the
  standard `px-3 py-2` + `text-sm`. Slightly taller dense forms, but consistent
  with every other edit form (and with the create form's own other sections,
  which already used the standard). Consistency was the explicit ask.
- **CC-4 via `<form className="contents">` + `ConfirmSubmitButton`.** Replaced the
  `window.confirm` remove with a form whose action is `removeDivision.bind(null,
…)`; `display:contents` keeps the button in the parent flex row, and the
  trigger keeps its low-emphasis red text-button look (custom `className`) while
  the modal confirm goes red via `destructive`.

## Changes

- `apps/web/src/components/field-styles.ts` — **new** shared field recipe.
- 16 forms migrated to import it (create/edit-event via `form-primitives.tsx`
  re-export; `divisions-repeater`, `host-divisions-manager`,
  `event-advanced-details-panel`, `sponsor-panel`, `guest-signup-form`,
  `claim-form`, `profile-form`, `add-profile-video-form`, `add-media-form`,
  `new-team-form`, `new-group-form`, `edit-group-form`, `community-listing-form`,
  `community-listing-edit-form`, `scoreboard/setup-form`).
- `host-divisions-manager.tsx` — CC-4: `window.confirm` → `ConfirmSubmitButton`;
  dropped the `handleRemove` helper.

Verify chain green: typecheck, lint (0 errors; 3 pre-existing warnings), 621
tests, build.

## Patterns observed

- **A primitive that doesn't cover `<select>` can't unify a select-heavy form.**
  `TextField` adoption stalled partly because half the fields in these forms are
  selects it can't wrap, so authors hand-rolled the inputs to match the selects.
  The plain shared recipe sidesteps that — and is the lower-friction default that
  should slow re-drift.
- **Re-export at a hub beats N direct imports.** `form-primitives.tsx` already was
  the create/edit-event hub; routing the shared recipe through it touched one file
  instead of every section.

## Follow-ups

- **CC-2 ratchet (✅ shipped 2026-05-31c, same day).** Added two
  `no-restricted-syntax` selectors to `apps/web/eslint.config.mjs` (next to the
  M3 shape-scale ratchet): a `const inputClass`/`labelClass`/`selectClass` with a
  string- or template-literal RHS is now a lint error pointing at
  `field-styles.ts` / `TextField`. The literal-RHS check keeps the
  `form-primitives.tsx` re-exports (Identifier RHS) clean; the two compact-inline
  exceptions opt out with a reasoned `eslint-disable`. Verified it fires on a
  probe. Recorded as AGENTS.md pattern 11 so it's discoverable without reading
  the journal. Same ratchet-behind-migration lesson as m3-alignment.md.
- Remaining P2 in [persona-ux.md](../audits/persona-ux.md): CC-1 remainder (~45
  files + header sign-up/sign-in pills), login-page primitives, shared
  `GuestSignupFields`, host form depth + divisions-manager FormModal (CC-5/H-2).
