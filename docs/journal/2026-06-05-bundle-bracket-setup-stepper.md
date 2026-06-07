# Bracket setup is now a guided stepper; host tools demoted to third-class (2026-06-05)

## Context

User feedback on the `/events/[id]/bracket` page, two issues:

1. **"Make the bracket/pool play setup a stepper — a step-by-step process
   when building these."** The create form (`FormatPickerForm`) was a single
   wall of controls. Pool play especially dumped format cards, match length,
   pool count / advance / schedule / courts / work-team, and playoff length
   into one scroll — overwhelming for the one-time-a-tournament host.
2. **"The host tools section on the bracket is distracting. Remove it or make
   it a third-class item — not primary, not secondary."** `EventToolsCard`
   rendered as a bordered card pinned to the **top** of the workspace, above
   the bracket itself, competing with the actual content.

Then, mid-bundle: **"The host should confirm the registered teams and add any
off-site / walk-in teams."** — surface team confirmation as its own first step
rather than a separate modal tacked onto the page.

## Decisions

- **Keep it one `<form>`; gate steps with the `hidden` attribute, not
  conditional mounting.** `FormatPickerForm` is fully controlled, but the
  server action reads `FormData` from the live DOM — unmounting a step would
  drop its fields from the submission. Wrapping each step's content in
  `<div hidden={stepKey !== '…'}>` keeps every input in the DOM (so it always
  submits) while `display:none` hides it. The server action and its config
  parsing are **completely untouched** — this is purely a presentation
  reshuffle of the existing JSX. Chose this over a multi-page form with
  mirrored hidden state inputs (duplicate-name `FormData` hazard, more code).
- **Dynamic, key-driven step list.** Steps are objects `{ key, label }` and
  the panels test `stepKey`, not an index — so adding/removing a step (Teams
  only on the event path, Pools only for pool play) is a one-line array
  spread and never desyncs a panel from its position. `current` is clamped
  (`Math.min(step, lastStep)`) so flipping the format on an earlier step —
  which can shrink the list — can't strand us past the end. No `useEffect` +
  `setState` (avoids the `react-hooks/set-state-in-effect` ratchet).
- **"Teams" leads the event path; standalone skips it.** Event brackets have
  registered teams to confirm, so the stepper opens on a Teams step (list +
  walk-in/off-site add) bound to the event scope. Standalone brackets
  (ADR 0025) add teams _after_ creation by design, so when `registeredTeams`
  is omitted the step (and its scope) simply don't exist. The walk-in
  `FormModal` lives **inside** the step but portals to `body` (Radix Dialog),
  so there's no nested-`<form>` DOM violation; its trigger is `type="button"`.
  After an add, `addWalkInTeam` revalidates the page → fresh `registeredTeams`
  flows back in → the list updates _under_ the persisted client `step` state
  (component identity is stable across revalidation).
- **Review step owns the Create button.** Steps 1..n-1 carry `type="button"`
  Back/Next; only the review step renders the `SubmitButton`. The review panel
  is a plain-language recap (format, length, pools, playoff length, team count,
  estimated matches) plus the existing blocking warnings, so the host confirms
  before committing. The create-disabled gate (`teamCount < 2 || belowMin ||
poolPlayUnderfilled`) is unchanged.
- **Host tools → collapsed `<details>` at the bottom.** "Third-class" =
  a muted, closed-by-default disclosure moved below the bracket board, with a
  chevron that rotates on `group-open`. Kept (not removed) because it closes
  the TT-1 discovery gap (`docs/audits/tournament-tools-workflow.md`); demoting
  it satisfies the "make it third-class" option while preserving the
  functionality. Still host-gated behind `caps.canManage` so spectators on the
  cacheable page never see it.

## Changes

- `apps/web/.../bracket/_components/format-picker-form.tsx` — stepper rail
  (`<ol>` with `aria-current="step"`, visited-step back-jump), `hidden` step
  panels, new Teams step (list + walk-in `FormModal`), Review panel, Back/Next
  vs. Create footer. New optional `registeredTeams` prop.
- `apps/web/.../bracket/_components/no-bracket-view.tsx` — pass
  `registeredTeams` through; drop the standalone "Add teams" modal + the
  team-count badge (now handled by the Teams step); simplify the intro copy.
  Took `registeredTeams` in place of the bare `teamCount`.
- `apps/web/.../bracket/_components/bracket-workspace.tsx` — host-tools card
  moved from top to a collapsed `<details>` at the bottom; `NoBracketView`
  call site updated to pass `registeredTeams`.

## Patterns observed

- **A multi-section controlled form becomes a stepper cheaply by toggling
  `hidden`, _not_ by unmounting.** The form stays one `<form>`, the server
  action is untouched, and every field still submits regardless of the visible
  step. Key the panels off a `stepKey` string (not an index) so a
  conditionally-present step can't shift a panel onto the wrong slot.
- **A modal can live inside a step of a server-action form** because Radix
  Dialog portals its content to `body` — the nested form is detached in the
  DOM. Only the `type="button"` trigger sits inside the outer `<form>`.

## Follow-ups

- The bracket flow's Playwright coverage is still deploy-gated (see the bracket
  initiative memory). A spec asserting "stepper: Teams → add walk-in → Format →
  … → Create" and "host tools collapsed by default" would pin this UI but needs
  a green dev run first.
- `SetupView` (post-create, `setup` status) still has its own seeding + walk-in
  modal — intentionally separate from the create stepper, but a future pass
  could unify the visual language (same stepper rail showing Create → Seed →
  Generate as completed/next).
